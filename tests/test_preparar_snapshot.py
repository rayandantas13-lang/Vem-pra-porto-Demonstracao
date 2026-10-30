import csv
import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('preparar_snapshot', Path(__file__).resolve().parents[1] / 'scripts/preparar_snapshot.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SnapshotTest(unittest.TestCase):
    def file(self, rows):
        temp = tempfile.NamedTemporaryFile(mode='w', newline='', encoding='utf-8-sig', delete=False)
        self.addCleanup(Path(temp.name).unlink, missing_ok=True)
        with temp:
            csv.writer(temp).writerows(rows)
        return Path(temp.name)

    def test_preserves_quoted_json_and_money(self):
        path = self.file([['id', 'codigo', 'clientes', 'passeios', 'total'],
                          ['x', "VP-'1", '["João"]', '[{"local":"a\\nb"}]', 'R$ 1.234,56']])
        rows = module.read_csv(path, 'vouchers')
        sql = module.make_sql({'vouchers': rows})
        self.assertIn("VP-''1", sql)
        self.assertIn('R$ 1.234,56', sql)
        self.assertIn('SET LOCAL standard_conforming_strings = on;', sql)
        self.assertIn('REVOKE ALL ON TABLE', sql)
        self.assertIn('ENABLE ROW LEVEL SECURITY', sql)
        self.assertEqual(len(rows), 1)

    def test_rejects_missing_columns_and_duplicate_ids(self):
        with self.assertRaises(ValueError):
            module.read_csv(self.file([['id', 'codigo'], ['x', 'abc']]), 'vouchers')
        with self.assertRaises(ValueError):
            module.read_csv(self.file([['id', 'descricao', 'valor', 'data'], ['x', 'a', '1', '2026'], ['x', 'b', '2', '2026']]), 'gastos')

    def test_rejects_malformed_rows(self):
        with self.assertRaises(ValueError):
            module.read_csv(self.file([['chave', 'valor'], ['x']]), 'config')

if __name__ == '__main__':
    unittest.main()
