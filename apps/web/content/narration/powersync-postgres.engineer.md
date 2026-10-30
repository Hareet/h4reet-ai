---
item: powersync-postgres
path: engineer
claims:
  - file: corpus/02-production-infrastructure-national-scale.md
    quote: "He investigated CouchDB in depth"
  - file: corpus/02-production-infrastructure-national-scale.md
    quote: "From his own benchmarking, he determined that at national scale the `get-ids` endpoint would not perform reliably when many users with large documents synced at once"
  - file: corpus/02-production-infrastructure-national-scale.md
    quote: "To remove that constraint, he mapped the changes needed in cht-datasource to complete its API endpoints and safely separate the backend"
  - file: corpus/02-production-infrastructure-national-scale.md
    quote: "He engaged PowerSync, obtained nonprofit licenses, and built a custom offline PowerSync-to-Postgres client and server backend for CHT"
  - file: corpus/02-production-infrastructure-national-scale.md
    quote: "He designed and built an offline PowerSync-to-Postgres client and server for CHT"
  - file: corpus/02-production-infrastructure-national-scale.md
    quote: "Status: being finished for production; the migration path for partners is being documented"
  - file: corpus/02-production-infrastructure-national-scale.md
    quote: "cht-agent is used on this migration"
slots: [postgres.benchmark_finding]
---

Hareet investigated CouchDB in depth. From his own benchmarking, he determined that at national scale the get-ids endpoint would not perform reliably when many users with large documents synced at once. {{slot:postgres.benchmark_finding}} To remove that constraint, he mapped the changes needed in cht-datasource to complete its API endpoints and safely separate the backend. He engaged PowerSync, obtained nonprofit licenses, then designed and built an offline PowerSync-to-Postgres client and server for CHT. It is being finished for production, the migration path for partners is being documented, and cht-agent is used on this migration.
