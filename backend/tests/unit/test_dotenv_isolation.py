"""Configuration precedence and isolation for schema maintenance."""

from pathlib import Path

from app.core.config.dotenv import schema_environment


def test_schema_environment_precedence_and_test_opt_out(tmp_path: Path) -> None:
    root = tmp_path / "root.env"
    backend = tmp_path / "backend.env"
    root.write_text(
        'DATABASE_URL="postgresql://root:quoted%40password@localhost/root"\n'
        "APP_ENV=development\nDB_SSL_MODE=disable\n",
        encoding="utf-8",
    )
    backend.write_text(
        "database_url=postgresql://backend:fixture@localhost/backend\n"
        "DB_SSL_MODE=require # local policy override\n",
        encoding="utf-8",
    )
    files = (root, backend)
    assert schema_environment({}, files=files)["DATABASE_URL"].endswith("/backend")
    assert schema_environment({}, files=files)["DB_SSL_MODE"] == "require"
    process = {"DATABASE_URL": "postgresql://process:fixture@localhost/process"}
    assert (
        schema_environment(process, files=files)["DATABASE_URL"]
        == process["DATABASE_URL"]
    )
    isolated = {**process, "CITELADDER_DISABLE_DOTENV": "1"}
    assert schema_environment(isolated, files=files) == isolated


def test_schema_environment_expands_without_executing_shell(tmp_path: Path) -> None:
    path = tmp_path / "schema.env"
    path.write_text(
        "export DATABASE_NAME=local\n"
        "DATABASE_URL='postgresql://fixture:${PASSWORD}@localhost/${DATABASE_NAME}'\n"
        "APP_ENV=${MISSING:-development}\n",
        encoding="utf-8",
    )
    result = schema_environment({"PASSWORD": "encoded%40fixture"}, files=(path,))
    assert (
        result["DATABASE_URL"]
        == "postgresql://fixture:encoded%40fixture@localhost/local"
    )
    assert result["APP_ENV"] == "development"


def test_schema_environment_preserves_multiline_quotes_and_quoted_comments(
    tmp_path: Path,
) -> None:
    path = tmp_path / "schema.env"
    path.write_text(
        'UNRELATED="first line\n'
        'second line with \\"quotes\\"" # comment with "quotes"\n'
        'DATABASE_URL="postgresql://fixture:fixture@localhost/app" # use "local"\n'
        "OTHER='single\nquoted value'\n",
        encoding="utf-8",
    )
    result = schema_environment({}, files=(path,))
    assert result["DATABASE_URL"] == "postgresql://fixture:fixture@localhost/app"
    assert result["UNRELATED"] == 'first line\nsecond line with "quotes"'
    assert result["OTHER"] == "single\nquoted value"
