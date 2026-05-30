/**
 * Task Queue
 *
 * An in-process async task queue with:
 *   • Configurable concurrency (default: 1 — Shorts run sequentially)
 *   • Priority levels: HIGH (1) → NORMAL (5) → LOW (10)
 *   • Per-task timeout enforcement
 *   • Pause / resume / drain support
 *   • Full event emission for monitoring
 *   • Persistent queue state to project/logs/queue_state.json
 *     so in-flight tasks survive a graceful restart
 *
 * Events emitted:
 *   'enqueued'   (task)
 *   'started'    (task)
 *   'completed'  (task, result)
 *   'failed'     (task, error)
 *   'drained'    ()
 *   'paused'     ()
 *   'resumed'    ()
 */

'use strict';

const EventEmitter = require('events');
const fs           = require('fs');
const path         = require('path');
const { v4: uuidv4 } = require('uuid');
const logger         = require('../utils/logger');

const STATE_FILE = path.resolve(__dirname, '..', '..', 'project', 'logs', 'queue_state.json');

// ── Priority constants ────────────────────────────────────────────────────────

const Priority = Object.freeze({ HIGH: 1, NORMAL: 5, LOW: 10 });

// ── Task status ───────────────────────────────────────────────────────────────

const Status = Object.freeze({
  PENDING:   'pending',
  RUNNING:   'running',
  COMPLETED: 'completed',
  FAILED:    'failed',
  CANCELLED: 'cancelled',
});

// ── TaskQueue class ───────────────────────────────────────────────────────────

class TaskQueue extends EventEmitter {
  /**
   * @param {object} [opts]
   * @param {number} [opts.concurrency=1]
   * @param {number} [opts.defaultTimeout=30*60*1000]  — 30 min
   */
  constructor({ concurrency = 1, defaultTimeout = 30 * 60 * 1000 } = {}) {
    super();
    this.concurrency      = concurrency;
    this.defaultTimeout   = defaultTimeout;
    this._queue           = [];   // pending tasks, sorted by priority
    this._running         = new Map();  // taskId → { task, timer }
    this._history         = [];   // completed/failed tasks (last 100)
    this._paused          = false;
    this._drainResolvers  = [];
    this._saveTimer       = null; // debounce handle for _saveState
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Add a task to the queue.
   *
   * @param {object} opts
   * @param {string}   opts.name        — human-readable label
   * @param {Function} opts.fn          — async function to execute
   * @param {number}   [opts.priority]  — Priority.HIGH | NORMAL | LOW
   * @param {number}   [opts.timeout]   — ms before task is killed
   * @param {object}   [opts.meta]      — arbitrary metadata stored with the task
   * @returns {string} taskId
   */
  enqueue({ name, fn, priority = Priority.NORMAL, timeout, meta = {} }) {
    const task = {
      id:          uuidv4().split('-')[0],
      name,
      fn,
      priority,
      timeout:     timeout ?? this.defaultTimeout,
      meta,
      status:      Status.PENDING,
      enqueuedAt:  new Date().toISOString(),
      startedAt:   null,
      completedAt: null,
      result:      null,
      error:       null,
      attempt:     0,
    };

    // Insert in priority order (lower number = higher priority)
    const insertAt = this._queue.findIndex((t) => t.priority > task.priority);
    if (insertAt === -1) this._queue.push(task);
    else this._queue.splice(insertAt, 0, task);

    logger.info(`[taskQueue] Enqueued: "${name}" (id=${task.id}, priority=${priority}, queueLen=${this._queue.length})`);
    this.emit('enqueued', task);
    this._saveState();
    this._tick();

    return task.id;
  }

  /** Pause processing (running tasks finish, new ones wait). */
  pause() {
    this._paused = true;
    logger.info('[taskQueue] Paused');
    this.emit('paused');
  }

  /** Resume processing. */
  resume() {
    this._paused = false;
    logger.info('[taskQueue] Resumed');
    this.emit('resumed');
    this._tick();
  }

  /**
   * Wait until the queue is empty and all tasks have finished.
   * @returns {Promise<void>}
   */
  drain() {
    if (this._queue.length === 0 && this._running.size === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => this._drainResolvers.push(resolve));
  }

  /** Cancel a pending task by ID. Returns true if found and cancelled. */
  cancel(taskId) {
    const idx = this._queue.findIndex((t) => t.id === taskId);
    if (idx === -1) return false;
    const [task] = this._queue.splice(idx, 1);
    task.status = Status.CANCELLED;
    this._addToHistory(task);
    logger.info(`[taskQueue] Cancelled: "${task.name}" (id=${taskId})`);
    return true;
  }

  /** Return a snapshot of current queue state. */
  getStatus() {
    return {
      pending:   this._queue.length,
      running:   this._running.size,
      paused:    this._paused,
      concurrency: this.concurrency,
      history:   this._history.length,
    };
  }

  /** Return all pending tasks. */
  getPending() {
    return this._queue.map((t) => ({ id: t.id, name: t.name, priority: t.priority, enqueuedAt: t.enqueuedAt }));
  }

  /** Return recent history (last 50 completed/failed tasks). */
  getHistory() {
    return this._history.slice(-50);
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  _tick() {
    if (this._paused) return;

    while (this._running.size < this.concurrency && this._queue.length > 0) {
      const task = this._queue.shift();
      this._execute(task);
    }
  }

  async _execute(task) {
    task.status    = Status.RUNNING;
    task.startedAt = new Date().toISOString();
    task.attempt++;

    logger.info(`[taskQueue] Starting: "${task.name}" (id=${task.id}, attempt=${task.attempt})`);
    this.emit('started', task);
    this._saveState();

    // Timeout enforcement
    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error(`Task "${task.name}" timed out after ${task.timeout / 1000}s`)),
        task.timeout
      );
    });

    this._running.set(task.id, { task, timer: timeoutHandle });

    try {
      const result = await Promise.race([task.fn(task), timeoutPromise]);
      clearTimeout(timeoutHandle);

      task.status      = Status.COMPLETED;
      task.completedAt = new Date().toISOString();
      task.result      = result;

      const elapsed = ((new Date(task.completedAt) - new Date(task.startedAt)) / 1000).toFixed(1);
      logger.info(`[taskQueue] ✅ Completed: "${task.name}" (id=${task.id}) in ${elapsed}s`);
      this.emit('completed', task, result);

    } catch (err) {
      clearTimeout(timeoutHandle);

      task.status      = Status.FAILED;
      task.completedAt = new Date().toISOString();
      task.error       = err.message;

      logger.error(`[taskQueue] ❌ Failed: "${task.name}" (id=${task.id}): ${err.message}`);
      this.emit('failed', task, err);

    } finally {
      this._running.delete(task.id);
      this._addToHistory(task);
      this._saveState();
      this._tick();
      this._checkDrain();
    }
  }

  _checkDrain() {
    if (this._queue.length === 0 && this._running.size === 0) {
      this.emit('drained');
      this._drainResolvers.forEach((r) => r());
      this._drainResolvers = [];
    }
  }

  _addToHistory(task) {
    // Strip the fn reference before storing
    const { fn: _fn, ...rest } = task;
    this._history.push(rest);
    if (this._history.length > 100) this._history.shift();
  }

  _saveState() {
    // Debounce: only write state at most once per 2 seconds
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      try {
        const dir = path.dirname(STATE_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const state = {
          savedAt:  new Date().toISOString(),
          status:   this.getStatus(),
          pending:  this.getPending(),
          history:  this.getHistory().slice(-20),
        };
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
      } catch { /* non-fatal */ }
    }, 2000);
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────

const queue = new TaskQueue({ concurrency: 1 });

module.exports = { TaskQueue, queue, Priority, Status };
