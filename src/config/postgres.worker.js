const { workerData } = require('node:worker_threads');
const { Pool, types } = require('pg');

types.setTypeParser(20, value => Number(value));

const address = new URL(workerData.connectionString);
const pool = new Pool({
  connectionString: address.toString(),
  ssl: address.searchParams.has('sslmode')
    ? undefined
    : { rejectUnauthorized: true },
  max: 1,
  connectionTimeoutMillis: 10000,
  query_timeout: 30000
});

let transactionClient = null;
let transactionDepth = 0;
const signalDone = (signal, response) => {
  workerData.port.postMessage(response);
  const state = new Int32Array(signal);
  Atomics.store(state, 0, 1);
  Atomics.notify(state, 0, 1);
};

workerData.port.on('message', async request => {
  try {
    let result;

    if (request.operation === 'close') {
      if (transactionClient) {
        await transactionClient.query('ROLLBACK');
        transactionClient.release();
        transactionClient = null;
        transactionDepth = 0;
      }
      await pool.end();
      result = { rows: [], rowCount: 0 };
    } else if (request.operation === 'begin') {
      if (transactionClient) {
        await transactionClient.query(`SAVEPOINT municipal_${transactionDepth}`);
        transactionDepth += 1;
      } else {
        transactionClient = await pool.connect();
        try {
          await transactionClient.query('BEGIN');
          transactionDepth = 1;
        } catch (error) {
          transactionClient.release();
          transactionClient = null;
          throw error;
        }
      }
      result = { rows: [], rowCount: 0 };
    } else if (request.operation === 'commit' || request.operation === 'rollback') {
      if (!transactionClient) throw new Error('No hay una transacción abierta.');
      const client = transactionClient;
      if (transactionDepth > 1) {
        const savepoint = `municipal_${transactionDepth - 1}`;
        if (request.operation === 'rollback') {
          await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        }
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        transactionDepth -= 1;
      } else {
        try {
          await client.query(request.operation.toUpperCase());
        } finally {
          client.release();
          transactionClient = null;
          transactionDepth = 0;
        }
      }
      result = { rows: [], rowCount: 0 };
    } else {
      const client = transactionClient || pool;
      const query = await client.query(request.sql, request.parameters);
      result = { rows: query.rows, rowCount: query.rowCount };
    }

    signalDone(request.signal, { ok: true, result });
    if (request.operation === 'close') workerData.port.close();
  } catch (error) {
    signalDone(request.signal, {
      ok: false,
      message: error.message,
      code: error.code || null
    });
  }
});
