const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

function writeAudit({
  officeId,
  userId = null,
  municipioId = null,
  entity,
  entityId = null,
  action,
  fieldName = null,
  oldValue = null,
  newValue = null,
  source = 'CAPTURA_LOCAL'
}) {
  db.prepare(`
    INSERT INTO audit_log (
      id, office_id, user_id, municipio_id, entity, entity_id,
      action, field_name, old_value, new_value, source, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
  `).run(
    uuidv4(), officeId, userId, municipioId, entity, entityId,
    action, fieldName, oldValue, newValue, source
  );
}

module.exports = { writeAudit };
