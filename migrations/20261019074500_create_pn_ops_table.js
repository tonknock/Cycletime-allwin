// จำนวน OP ทั้งหมดของแต่ละ P/N ใช้เทียบว่าในประวัติบันทึก OP ไหนแล้ว OP ไหนยังขาด
// pn_key = P/N ตัวพิมพ์เล็ก ตัดช่องว่างออกหมด (ให้ "A + B" กับ "A+B" เป็นตัวเดียวกัน)
exports.up = async function (knex) {
  await knex.schema.createTable('pn_ops', (table) => {
    table.string('pn_key', 191).primary();
    table.string('pn', 191).notNullable();
    table.integer('total_ops').unsigned().notNullable();
    table.bigInteger('updatedAt');
  });
  await knex('pn_ops').insert({ pn_key: '12105cc3+12105cc4', pn: '12105CC3 + 12105CC4', total_ops: 4, updatedAt: Date.now() });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('pn_ops');
};
