# Session Startup & Rule Verification

> [!CAUTION]
> **CRITICAL PRIORITY: ZERO TOLERANCE**
> 1. You MUST execute this workflow **IMMEDIATELY** upon session start.
> 2. **DO NOT** issue any greeting, question, internal monologue, or other text until the Mandatory Output is generated.
> 3. Any response before "He leído..." is a TOTAL VIOLATION.

1.  **Mandatory Output**:
    - If and ONLY if you have read and understood the Engagement Rules below, you must output the following phrase exactly as an ephemeral message or response:
    - `"He leído y estoy siguiendo las reglas de GEMINI.md"`

2.  **Ready State**:
    - After confirmation, await user instructions in SILENCE. Do not list open files. Do not ask what to do. Do not propose actions. Just stop.

# Engagement Rules for Antigravity

1. **MANDATORY PLANNING & SYSTEM LOCK**: Every code change MUST be preceded by an `implementation_plan.md` artifact with `request_feedback = true`. This is a hard requirement to lock the execution environment.
2. **EXPLICIT APPROVAL**: ABSOLUTELY NO execution tools (`replace_file_content`, `multi_replace_file_content`, `run_command`, etc.) shall be used before receiving a direct, unambiguous textual "APROBADO" or "PROCEDE" from the user for that specific plan. If you restart, you must still wait for an explicit command before executing any pending plan.
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
13. **NO DISCULPARSE**: No te disculpes bajo ninguna circunstancia, ya que hace perder tiempo innecesario. Limítate a corregir el error y avanzar.
14. **RESPALDO MANUAL EN FIREBASE**: Todo procedimiento, corrección o inserción que se ejecute de forma manual (mediante scripts en backend o inyección en frontend) debe ser respaldado y persistido correctamente en Firebase para no comprometer la integridad y sincronización de los datos.
