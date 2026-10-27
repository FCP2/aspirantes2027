'use strict';

function normalizeParty(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function partyLabel(actor) {
  if (!actor) return '';
  return actor.partido_id === 'OTRO'
    ? (actor.partido_otro || actor.partido || '')
    : (actor.partido || actor.partido_id || actor.partido_otro || '');
}

function governingPartyProfile(presidency) {
  let full = normalizeParty(partyLabel(presidency));
  if (!full) return { full: '', primary: '', members: new Set() };

  const otherWrapper = full.match(/^OTRO\s*[:(-]\s*(.+?)\)?$/);
  if (otherWrapper?.[1]) full = normalizeParty(otherWrapper[1]);

  const opening = full.indexOf('(');
  const closing = full.lastIndexOf(')');
  const primary = normalizeParty(opening >= 0 ? full.slice(0, opening) : full);
  const coalitionText = opening >= 0 && closing > opening
    ? full.slice(opening + 1, closing)
    : (/[-+/,&]/.test(full) ? full : '');
  const members = new Set(coalitionText
    .split(/[\s,+/&-]+/)
    .map(normalizeParty)
    .filter(token => token.length >= 2 && token !== primary));

  return { full, primary, members };
}

function priority(actor, profile) {
  const party = normalizeParty(partyLabel(actor));
  if (!party || !profile.full) return 2;
  if (party === profile.full || party === profile.primary) return 0;

  const actorTokens = party.split(/[\s(),+/&-]+/).map(normalizeParty).filter(Boolean);
  if (profile.members.has(party) || actorTokens.some(token => profile.members.has(token))) return 1;
  return 2;
}

function orderAspirantsForDisplay(aspirants, presidency) {
  const rows = Array.isArray(aspirants) ? aspirants : [];
  const profile = governingPartyProfile(presidency);
  return rows
    .map((actor, index) => ({
      actor,
      index,
      party: normalizeParty(partyLabel(actor)),
      priority: profile.full ? priority(actor, profile) : 2
    }))
    .sort((a, b) => {
      const byPriority = a.priority - b.priority;
      if (byPriority) return byPriority;

      if (!a.party && b.party) return 1;
      if (a.party && !b.party) return -1;
      const byParty = a.party.localeCompare(b.party, 'es', { sensitivity: 'base' });
      return byParty || a.index - b.index;
    })
    .map(item => item.actor);
}

module.exports = { normalizeParty, partyLabel, governingPartyProfile, orderAspirantsForDisplay };
