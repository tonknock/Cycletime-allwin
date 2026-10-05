exports.up = function (knex) {
  return knex.schema.alterTable('entries', (table) => {
    table.string('type').defaultTo('stamping');   // 'stamping' | 'pipe'
    table.string('pipeSize').nullable();
    table.json('pattern').nullable();              // เก็บ { type, items:[{name,qty}] } ของโหมดตัดท่อ
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('entries', (table) => {
    table.dropColumn('type');
    table.dropColumn('pipeSize');
    table.dropColumn('pattern');
  });
};