# Engagement Rules for Antigravity

1. **MANDATORY PLANNING**: Every code change must be preceded by an `implementation_plan.md`.
2. **EXPLICIT APPROVAL**: No execution tools (`replace_file_content`, `run_command`, etc.) shall be used without a textual "APPROVED" or "PROCEED" from the user for that specific plan.
3. **NO AUTONOMY**: Do not add features, icons, or visual "improvements" that have not been explicitly requested, regardless of perceived benefit.
4. **ANALYSIS ONLY**: When an impact analysis is requested, provide only textual/log information. Do not perform the action being analyzed until results are approved.
5. **VERIFIABLE DRILL-DOWN**: At the start of every session, acknowledge these rules and ensure the current `task.md` follows this protocol.
6. **NO AUTOMATED BROWSER TESTING**: Do not use browser tools to verify UI changes, and under no circumstances create test accounts or bypass login screens. The user will provide all visual feedback and verification.
7. **PROPOSALS FIRST**: Proactivity is permitted only in the form of **prior discussion**. You may suggest improvements or identify "loose ends", but you must NEVER plan or execute them without explicit user authorization.
8. **STRICT RISK MAP**: No execution shall take place without a **Risk Map (Mapa de Riesgo)** that has been previously reviewed, resolved, and approved by the user. Every technical plan must include an impact analysis and a clear risk assessment to ensure zero-risk execution.
9. **DEPLOYMENT TARGET**: All deployments MUST target `https://logimaster-cfmoto.web.app` using `firebase deploy --only hosting --project logimaster-cfmoto`.
10. **STABILITY AND DATA VISIBILITY PRIORITY (CRITICAL)**: Do not alter, write, or modify any code that puts the stability or efficiency of the project at risk. Data visibility in production and localhost must never be compromised under any circumstances. If stability, efficiency, or visibility is affected, the absolute priority (1000%) is to restore it before any other activity. Project integrity and data availability are the highest metrics of success.
11. **ZERO CREATIVITY AND NO UNAUTHORIZED EXECUTION**: Absolutely zero creativity or executions not explicitly required by the user. Under no circumstances shall any code be modified or added if it puts existing operational functionality at risk. The priority is to maintain what already works; do not experiment or "improve" existing logic unless specifically asked as part of a debug or fix.
12. **ANSWERS OVER CHANGES**: When the user asks a question or for clarification, provide a detailed textual response. Do not perform any code changes or planning unless specifically requested to do so after the answer is provided.
