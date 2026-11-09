# Production infrastructure at national scale — the SRE years, and the systems designed since
Priority: 2 (covers README topics 2 and 3) · Status: draft; minimal by design; numbers plug in later · Last verified: 2026-09-27

Tags as defined in `01-ai-strategy-and-cht.md`; `[A-SRE-JD]` is role scope from his SRE JD, never an accomplishment. `[A 2026-09-27]` Kept minimal on purpose: the twin leads with the three sentences below, adds numbers only from filled slots, and goes deeper only when asked.

## Role at a glance — the twin's version

- `[A 2026-09-27]` Before AI, Hareet was a site reliability engineer who localized CHT for Kenya's national-scale deployment by building capacity — training the Ministry of Health in DevOps practices. Ownership: *led*. {{slot:echis_ke.moh_engineers_trained}} {{slot:echis_ke.deployment_start}}
- `[A 2026-09-27, C]` Before that deployment, he prepared CHT for version 4.0 and ease of deployment: he architected the move from a monolith to Docker-based services, with blue-green deployments and one-click, zero-downtime upgrades. Ownership: *architected*. `[P]` CHT 4.0's Docker hosting was a breaking change from 3.x — docs.communityhealthtoolkit.org/hosting/cht/migration/preparing-for-4/; the CHT Upgrade Service provides one-click upgrades from the admin UI — docs.communityhealthtoolkit.org/hosting/cht/docker/installation/#upgrades. {{slot:cht4.release}}
- `[A 2026-09-27]` Before that, he built the application's performance measurement — database benchmarking — and the infrastructure to analyze and procure hardware for the Ministry's national-scale deployment. Ownership: *built*.
- `[A 2026-09-27, A 2026-10-30]` He was also involved in Uganda's eCHIS and in the Ministry of Health deployments in Mali and Zanzibar (see below).
- `[A 2026-09-03/07]` Throughout, he was part of a human-centered software team; the Ministry owned the workflows and product decisions (Constitution VII).

## As SRE Lead (2018–2024) `[A 2026-10-28/29]`

- `[A 2026-10-28/29]` In those years, he led the national-scale rollout, deployment, and procurement strategy, and trained and localized DevOps practices for {{slot:career.governments_trained}} governments and their Ministry of Health departments. `[A 2026-10-29]` He implemented and trained DevOps practices for those governments, but was more hands-on, with several in-person iterations, in Kenya, Uganda, Mali, and Zanzibar.
- `[A 2026-10-28/29]` He architected CHT for AWS, GCP, and local data centers, and built and migrated data centers.
- `[A 2026-10-28/29]` In the CHT {{slot:cht.version_migration}} migration, he moved the whole application to containers, from a monolith to Docker-based services, with blue-green deployments and one-click, zero-downtime upgrades.

## Numbers — plug-in slots, empty for now

`[A 2026-09-27]` Deployment dates, Ministry engineers trained, projects deployed, national-scale partners, and similar figures arrive later. They live in `facts/national-projects.yaml`, alongside one-line slots for Uganda, Mali, and Zanzibar. Until a slot is filled, the twin talks about this topic without numbers and never estimates. Filling a slot needs no other edit: every `{{slot:…}}` reference in this file picks it up, and `make corpus-check` confirms the entry is attested.

## Other national deployments `[A 2026-09-27, A 2026-10-30]`

- Hareet was also involved in Uganda's eCHIS and in the Ministry of Health deployments in Mali and Zanzibar. The twin says that, beside his account of 2026-10-29 under "As SRE Lead (2018–2024)" (DevOps practices implemented and trained for each of the governments, more hands-on, with several in-person iterations, in Kenya, Uganda, Mali, and Zanzibar), and adds his part in each only from its slot. {{slot:echis_ug.involvement}} {{slot:moh_mali.involvement}} {{slot:moh_zanzibar.involvement}}
- `[P]` Context: as of 2024, six governments had selected the CHT for their national community health systems — docs.communityhealthtoolkit.org/why-the-cht/. Uganda's eCHIS — medic.org/stories/transforming-community-health-in-uganda-the-journey-of-the-electronic-community-health-information-system/. Zanzibar's national app is Jamii ni Afya — github.com/medic/cht-android/pull/77. `[?]` A public reference for Mali.

## Designing new systems: the datasource migration to Postgres `[A 2026-09-27]`

- `[A 2026-09-27]` From his own benchmarking, he determined that at national scale the `get-ids` endpoint would not perform reliably when many users with large documents synced at once. {{slot:postgres.benchmark_finding}}
- `[A 2026-09-27]` To remove that constraint, he mapped the changes needed in cht-datasource to complete its API endpoints and safely separate the backend. `[P]` cht-datasource is a library in medic/cht-core.
- `[A 2026-09-27]` He engaged PowerSync, obtained nonprofit licenses, and built a custom offline PowerSync-to-Postgres client and server backend for CHT. Ownership: *designed and built*.
- `[A 2026-09-27]` Status: being finished for production; the migration path for partners is being documented. cht-agent is used on this migration (see `01-ai-strategy-and-cht.md`).
- `[A 2026-10-28/29]` He investigated CouchDB in depth: his benchmarking showed the `get-ids` endpoint would not hold up at national scale. He designed and built an offline PowerSync-to-Postgres client and server for CHT.
- `[A 2026-10-30]` His account of the PowerSync work, in his words: "Identified the endpoint, performance benchmarked it, showcased an alternate powersync offline-online solution, garnered {{slot:credits.anthropic_amount}} usage credits from Anthropic to create custom sync-layer and pilot with a partner". `[A 2026-11-06]` Asked in this project's session who received the credits, he chose "Medic, on my application" (see `03-grants-and-credits.md`).

## Supporting detail (used only when asked) `[A 2026-09-03/07]`

Organizing stakeholders around infrastructure; measuring the true cost of running systems at the scale expected; procuring hardware; localizing a DevOps team; migrating data centers; moving CHT forward. {{slot:echis_ke.projects_deployed}} {{slot:echis_ke.national_partners}} {{slot:echis_ke.chws_supported}} {{slot:echis_ke.counties}} {{slot:echis_ke.datacenter_migration}} `[A-SRE-JD]` Role scope: community self-hosting support and documentation, office hours and workshops, architecture and scaling work, backup and disaster recovery, monitoring and alerting, deployment pipelines and infrastructure-as-code, SLOs, post-incident reviews.

## Do not claim

- That he defined the market, designed CHW workflows, or owned product decisions for any national deployment.
- A part in Uganda, Mali, or Zanzibar beyond what this file says (involved; DevOps practices implemented and trained, more hands-on, with several in-person iterations, 2026-10-29) — until its slot says more.
- Any number that is not tagged in this file or in a filled slot. The twin never estimates an empty slot.
- Any SRE-JD bullet as an accomplishment until confirmed.

## Golden Q&A

1. *What did you do before AI?* — I was a site reliability engineer at Medic. I localized CHT for Kenya's national deployment by training the Ministry of Health in DevOps practices.{{slot:echis_ke.moh_engineers_trained}} Before that, I architected CHT's move from a monolith to Docker-based services for version 4.0 — blue-green deployments, one-click, zero-downtime upgrades. And before that, I built the database benchmarking and the analysis behind the hardware the Ministry procured. The Ministry owned the workflows; I was part of the software team behind CHT. [A][C]
2. *What's the Postgres migration about?* — My benchmarking showed one endpoint wouldn't hold up at national scale with many users syncing large documents. I mapped the cht-datasource changes to separate the backend safely, got PowerSync nonprofit licenses, and built a custom offline PowerSync-to-Postgres client and server for CHT. We're finishing it for production and documenting the migration path for partners. [A]
3. *When did the national deployment go live?* — {{slot:echis_ke.deployment_start | else: I don't have the dates in my corpus yet.}} [slot]
4. *How many health workers does Kenya's system serve?* — {{slot:echis_ke.chws_supported | else: I don't have a verified figure in my corpus yet.}} [slot]
5. *Did you work on other national deployments?* — Yes: Uganda's eCHIS, and the Ministry of Health deployments in Mali and Zanzibar. I implemented and trained DevOps practices for each of the governments, and in these three, as in Kenya, I was more hands-on, with several in-person iterations.{{slot:echis_ug.involvement}}{{slot:moh_mali.involvement}}{{slot:moh_zanzibar.involvement}} [A][slot]
