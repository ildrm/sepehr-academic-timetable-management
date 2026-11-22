from pathlib import Path
import csv, hashlib, json
root = Path(__file__).resolve().parents[2]
spec = root / "docx"
report = root / "implementation"
manifest = json.loads((spec / "MANIFEST.json").read_text())
files = [spec / name for name in ("README.md", "MANIFEST.json", "VALIDATION_REPORT.md")]
for folder in ("source", "artifacts", "diagrams/source", "references"):
    files.extend(p for p in (spec / folder).rglob("*") if p.is_file())
rows = [{"path": str(p.relative_to(root)), "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(files)]
document_status = {d["source_path"]: d.get("status") for d in manifest["documents"]}
(report / "SPEC_BASELINE.json").write_text(json.dumps({
    "source": "docx/", "institutionalApproval": "none recorded",
    "scopeAuthority": "Implementation prompt authorizes implementation of documented core; unresolved institutional policies gate activation.",
    "documentStatus": document_status, "files": rows
}, indent=2) + "\n")
with (spec / "artifacts/traceability.csv").open() as stream:
    traces = {r["requirement"]: r for r in csv.DictReader(stream)}
with (spec / "artifacts/requirements.csv").open() as stream, (report / "REQUIREMENTS_COVERAGE.csv").open("w", newline="") as dest:
    writer = csv.writer(dest)
    writer.writerow("requirement_id source_path_and_section release_scope implementation_status backend_location frontend_location schema_or_migration_location worker_or_solver_location contract_location test_identifiers verification_status evidence_path remaining_gap".split())
    for req in csv.DictReader(stream):
        trace = traces[req["id"]]
        scope = "proposed_not_approved" if req["scope"] != "core" else "required_for_current_release"
        writer.writerow([req["id"], "docx/" + trace["design"], scope, "not_started", "", "", "", "", "docx/artifacts/openapi.yaml" if trace["interface"].startswith("API") else "", trace["tests"], "not_run", "", ""])
