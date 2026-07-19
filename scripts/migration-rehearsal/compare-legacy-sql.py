#!/usr/bin/env python3

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

from pglast import parser


VOLATILE_AST_FIELDS = {
    "lineno",
    "location",
    "stmt_len",
    "stmt_location",
}


def clean_ast(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: clean_ast(item)
            for key, item in value.items()
            if key not in VOLATILE_AST_FIELDS
        }
    if isinstance(value, list):
        return [clean_ast(item) for item in value]
    return value


def defelem_string(option: dict[str, Any]) -> tuple[str | None, str | None]:
    element = option.get("DefElem")
    if not isinstance(element, dict):
        return None, None
    argument = element.get("arg")
    if not isinstance(argument, dict):
        return element.get("defname"), None
    string = argument.get("String")
    if isinstance(string, dict):
        return element.get("defname"), string.get("sval")
    return element.get("defname"), None


def hide_plpgsql_bodies(value: Any) -> None:
    if isinstance(value, dict):
        statement = value.get("CreateFunctionStmt")
        if isinstance(statement, dict):
            options = statement.get("options", [])
            language = None
            for option in options:
                if isinstance(option, dict):
                    name, string = defelem_string(option)
                    if name == "language":
                        language = string
            if language == "plpgsql":
                for option in options:
                    if not isinstance(option, dict):
                        continue
                    element = option.get("DefElem")
                    if not isinstance(element, dict) or element.get("defname") != "as":
                        continue
                    element["arg"] = {"String": {"sval": "<parsed-plpgsql-body>"}}
        for item in value.values():
            hide_plpgsql_bodies(item)
    elif isinstance(value, list):
        for item in value:
            hide_plpgsql_bodies(item)


def parsed_asts(sql: str) -> tuple[Any, Any]:
    sql_ast = json.loads(parser.parse_sql_json(sql))
    hide_plpgsql_bodies(sql_ast)
    plpgsql_ast = json.loads(parser.parse_plpgsql_json(sql))
    return clean_ast(sql_ast), clean_ast(plpgsql_ast)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def compare_pair(legacy_path: Path, numbered_path: Path) -> dict[str, Any]:
    legacy_bytes = legacy_path.read_bytes()
    numbered_bytes = numbered_path.read_bytes()
    legacy_sql = legacy_bytes.decode("utf-8")
    numbered_sql = numbered_bytes.decode("utf-8")
    legacy_sql_ast, legacy_plpgsql_ast = parsed_asts(legacy_sql)
    numbered_sql_ast, numbered_plpgsql_ast = parsed_asts(numbered_sql)
    sql_ast_equal = legacy_sql_ast == numbered_sql_ast
    plpgsql_ast_equal = legacy_plpgsql_ast == numbered_plpgsql_ast
    return {
        "legacy_sha256": sha256(legacy_bytes),
        "numbered_sha256": sha256(numbered_bytes),
        "byte_equal": legacy_bytes == numbered_bytes,
        "sql_ast_equal": sql_ast_equal,
        "plpgsql_ast_equal": plpgsql_ast_equal,
        "equivalent": sql_ast_equal and plpgsql_ast_equal,
    }


def main() -> int:
    arguments = argparse.ArgumentParser()
    arguments.add_argument("--map", required=True, type=Path)
    arguments.add_argument("--evidence-dir", required=True, type=Path)
    arguments.add_argument("--repo-migrations-dir", required=True, type=Path)
    arguments.add_argument("--output", required=True, type=Path)
    args = arguments.parse_args()

    mappings = json.loads(args.map.read_text(encoding="utf-8"))
    results = []
    for mapping in mappings:
        legacy_path = args.evidence_dir / mapping["legacy_file"]
        numbered_path = args.repo_migrations_dir / mapping["numbered_file"]
        if not legacy_path.is_file():
            raise FileNotFoundError(f"Legacy evidence is missing: {legacy_path}")
        if not numbered_path.is_file():
            raise FileNotFoundError(f"Numbered migration is missing: {numbered_path}")
        comparison = compare_pair(legacy_path, numbered_path)
        results.append({**mapping, **comparison})

    report = {
        "status": "PASS" if all(item["equivalent"] for item in results) else "FAIL",
        "comparison": "PostgreSQL SQL AST plus PL/pgSQL AST with source locations removed",
        "pglast_version": __import__("pglast").__version__,
        "pairs": results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Legacy equivalence: {report['status']}")
    for item in results:
        print(
            f"{item['legacy_version']} -> {item['numbered_version']}: "
            f"byte={'PASS' if item['byte_equal'] else 'DIFF'} "
            f"sql_ast={'PASS' if item['sql_ast_equal'] else 'FAIL'} "
            f"plpgsql_ast={'PASS' if item['plpgsql_ast_equal'] else 'FAIL'}"
        )
    print(f"Report: {args.output}")
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
