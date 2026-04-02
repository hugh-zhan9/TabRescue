---
name: check-backend
description: "Check if non-UI code follows the engineering guidelines."
---

Check if the code you just wrote follows the engineering guidelines.

Execute these steps:
1. Run `git status` to see modified files
2. Read `.trellis/spec/engineering/index.md` to understand which guidelines apply
3. Based on what you changed, read the relevant guideline files:
   - Storage changes → `.trellis/spec/engineering/storage-guidelines.md`
   - Error handling → `.trellis/spec/engineering/error-handling.md`
   - Logging changes → `.trellis/spec/engineering/logging-guidelines.md`
   - Compatibility changes → `.trellis/spec/engineering/compatibility-guidelines.md`
   - Any changes → `.trellis/spec/engineering/quality-guidelines.md`
4. Review your code against the guidelines
5. Report any violations and fix them if found
