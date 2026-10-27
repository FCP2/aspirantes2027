const usePostgres = process.env.RENDER === 'true'
  || process.env.MUNICIPAL_DB_ENGINE === 'postgres';

module.exports = usePostgres
  ? require('./database.postgres')
  : require('./database.sqlite');
