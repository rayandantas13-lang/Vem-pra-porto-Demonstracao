#!/usr/bin/env python3
"""Prepare an offline, private staging snapshot from Google Sheets CSV exports.

The generated SQL contains customer data. Never commit it or send it to a public
service. This is a staging snapshot only; it does not switch the application.
"""
import argparse
import csv
import json
import sys
from pathlib import Path

HEADERS = {
    'vouchers': ('id', 'codigo', 'clientes', 'passeios'),
    'gastos': ('id', 'descricao', 'valor', 'data'),
    'config': ('chave', 'valor'),
    'auditoria': ('id', 'usuarioId', 'acao'),
}


def sql_literal(value):
    # Use standard-conforming strings so backslashes in JSON remain literal.
    return "'" + value.replace("'", "''") + "'"


def read_csv(path, sheet):
    with path.open(encoding='utf-8-sig', newline='') as source:
        reader = csv.DictReader(source)
        if not reader.fieldnames or len(set(reader.fieldnames)) != len(reader.fieldnames):
            raise ValueError(f'{sheet}: cabeçalho ausente ou duplicado')
        missing = set(HEADERS[sheet]) - set(reader.fieldnames)
        if missing:
            raise ValueError(f'{sheet}: colunas obrigatórias ausentes: {", ".join(sorted(missing))}')
        rows = []
        keys = set()
        key_field = 'chave' if sheet == 'config' else 'id'
        for line, row in enumerate(reader, start=2):
            if None in row:
                raise ValueError(f'{sheet}: linha {line} tem colunas extras')
            if any(value is None for value in row.values()):
                raise ValueError(f'{sheet}: linha {line} tem colunas ausentes')
            if not any(value.strip() for value in row.values()):
                continue
            key = row[key_field].strip()
            if not key or key in keys:
                raise ValueError(f'{sheet}: identificador vazio ou duplicado na linha {line}')
            keys.add(key)
            rows.append((line, row))
        return rows


def make_sql(sheets):
    out = [
        '-- Dados privados: não publique ou adicione este arquivo ao Git.',
        '-- Snapshot temporário; não altera a aplicação nem a planilha original.',
        'BEGIN;',
        'SET LOCAL standard_conforming_strings = on;',
        'CREATE SCHEMA IF NOT EXISTS migration_private;',
        'REVOKE ALL ON SCHEMA migration_private FROM PUBLIC, anon, authenticated;',
        'CREATE TABLE IF NOT EXISTS migration_private.sheet_rows (sheet text NOT NULL, source_row integer NOT NULL, data jsonb NOT NULL, PRIMARY KEY (sheet, source_row));',
        'REVOKE ALL ON TABLE migration_private.sheet_rows FROM PUBLIC, anon, authenticated;',
        'ALTER TABLE migration_private.sheet_rows ENABLE ROW LEVEL SECURITY;',
    ]
    for sheet, rows in sheets.items():
        out.append(f'DELETE FROM migration_private.sheet_rows WHERE sheet = {sql_literal(sheet)};')
        for line, row in rows:
            data = json.dumps(row, ensure_ascii=False, separators=(',', ':'))
            out.append(f'INSERT INTO migration_private.sheet_rows (sheet, source_row, data) VALUES ({sql_literal(sheet)}, {line}, {sql_literal(data)}::jsonb);')
    out.append('COMMIT;')
    return '\n'.join(out) + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in HEADERS:
        parser.add_argument(f'--{name}', type=Path, help=f'CSV exportado da aba {name}')
    args = parser.parse_args()
    chosen = {name: getattr(args, name) for name in HEADERS if getattr(args, name)}
    if not chosen:
        parser.error('informe pelo menos um CSV')
    try:
        sheets = {name: read_csv(path, name) for name, path in chosen.items()}
    except (OSError, UnicodeError, ValueError, csv.Error) as exc:
        print(f'Erro: {exc}', file=sys.stderr)
        return 1
    sys.stdout.write(make_sql(sheets))
    print('Linhas preparadas: ' + ', '.join(f'{name}={len(rows)}' for name, rows in sheets.items()), file=sys.stderr)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
