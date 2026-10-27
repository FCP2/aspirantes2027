'use strict';

// Los navegadores limitan la vigencia de una cookie persistente. La renovamos
// con cada visita para que el acceso siga activo mientras se use el sistema.
module.exports = 365 * 24 * 60 * 60 * 1000;
