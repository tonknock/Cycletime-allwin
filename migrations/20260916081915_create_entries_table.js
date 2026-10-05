exports.up = function(knex) {
  return knex.schema.createTableIfNotExists('entries', function(table) {
    table.increments('id').primary();
    table.string('pn', 100);
    table.string('op', 100);
    table.string('process', 100);
    table.decimal('shiftHours', 5, 2);
    table.text('rows', 'longtext');
    table.text('stats', 'longtext');
    table.bigInteger('createdAt');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('entries');
};