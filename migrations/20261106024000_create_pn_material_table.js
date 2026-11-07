// วัสดุของแต่ละ P/N (เช่น Aluminium) ใช้แสดงสัญลักษณ์บนหน้าเว็บ
// pn_key ใช้กติกาเดียวกับ pn_ops (ตัวพิมพ์เล็ก ตัดช่องว่างออกหมด)
exports.up = async function (knex) {
  await knex.schema.createTable('pn_material', (table) => {
    table.string('pn_key', 191).primary();
    table.string('pn', 191).notNullable();
    table.string('material', 32).notNullable();
    table.bigInteger('updatedAt');
  });
  await knex('pn_material').insert({ pn_key: '12125csn', pn: '12125CSN', material: 'aluminium', updatedAt: Date.now() });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('pn_material');
};
