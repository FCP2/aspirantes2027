const path = require('node:path');
const {
  Worker,
  MessageChannel,
  receiveMessageOnPort
} = require('node:worker_threads');

if (!process.env.MUNICIPAL_DATABASE_URL) {
  throw new Error('Falta MUNICIPAL_DATABASE_URL para PostgreSQL municipal.');
}

const { port1, port2 } = new MessageChannel();
const worker = new Worker(path.join(__dirname, 'postgres.worker.js'), {
  workerData: {
    connectionString: process.env.MUNICIPAL_DATABASE_URL,
    port: port2
  },
  transferList: [port2]
});

let workerError = null;
worker.on('error', error => {
  workerError = error;
});
worker.on('exit', code => {
  if (code !== 0) {
    workerError = new Error(`El proceso de PostgreSQL terminó con código ${code}.`);
  }
});

function execute(operation, sql = '', parameters = []) {
  if (workerError) throw workerError;

  const signal = new Int32Array(new SharedArrayBuffer(4));
  port1.postMessage({ operation, sql, parameters, signal: signal.buffer });

  const status = Atomics.wait(signal, 0, 0, 45000);
  if (status === 'timed-out') {
    throw new Error('PostgreSQL no respondió dentro de 45 segundos.');
  }

  const packet = receiveMessageOnPort(port1);
  if (!packet) {
    throw new Error('PostgreSQL no devolvió una respuesta válida.');
  }

  const response = packet.message;
  if (!response.ok) {
    const error = new Error(response.message);
    error.code = response.code;
    throw error;
  }

  return response.result;
}

function translate(sql) {
  let parameterIndex = 0;

  return sql
    .replace(/datetime\('now','localtime'\)/gi,
      "to_char(CURRENT_TIMESTAMP AT TIME ZONE 'America/Mexico_City', 'YYYY-MM-DD HH24:MI:SS')")
    .replace(/(\w+)\s*=\s*\?\s+COLLATE NOCASE/gi,
      (_, column) => `LOWER(${column})=LOWER(?)`)
    .replace(/\bLIKE\b/gi, 'ILIKE')
    .replace(/\?/g, () => `$${++parameterIndex}`);
}

const database = {
  prepare(sql) {
    const translated = translate(sql);

    return {
      get(...parameters) {
        return execute('query', translated, parameters).rows[0];
      },
      all(...parameters) {
        return execute('query', translated, parameters).rows;
      },
      run(...parameters) {
        const result = execute('query', translated, parameters);
        return { changes: result.rowCount };
      }
    };
  },

  exec(sql) {
    const command = sql.trim().replace(/;$/, '').toUpperCase();
    if (command === 'BEGIN IMMEDIATE' || command === 'BEGIN') {
      return execute('begin');
    }
    if (command === 'COMMIT') return execute('commit');
    if (command === 'ROLLBACK') return execute('rollback');
    return execute('query', translate(sql));
  },

  transaction(fn) {
    return (...args) => {
      database.exec('BEGIN');
      try {
        const result = fn(...args);
        if (result && typeof result.then === 'function') {
          throw new Error('La transacción síncrona no admite promesas.');
        }
        database.exec('COMMIT');
        return result;
      } catch (error) {
        try {
          database.exec('ROLLBACK');
        } catch (rollbackError) {
          console.error('No se pudo revertir la transacción PostgreSQL:', rollbackError);
        }
        throw error;
      }
    };
  },

  close() {
    execute('close');
    port1.close();
  }
};

module.exports = database;
