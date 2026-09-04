
#!/bin/bash

baseDir=$(cd `dirname $0`;pwd)
cd $baseDir
execStartTime=`date +%Y%m%d-%H:%M:%S`

echo "${execStartTime} Exe Dir: $baseDir"

# All text file types. Covers TS/JS/JSON/mjs/html/css/sh/yml etc.
# -excludes: node_modules, dist/build output, .git
ALL_EXTS='-type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.mjs" -o -name "*.cjs" -o -name "*.json" -o -name "*.mdx" -o -name "*.md" -o -name "*.html" -o -name "*.css" -o -name "*.scss" -o -name "*.yml" -o -name "*.yaml" -o -name "*.sh" \) -not -path "*/node_modules/*" -not -path "*/dist/*" -not -path "*/build/*" -not -path "*/out/*" -not -path "*/.git/*"'

echo "########## custom vscode extension ########## "

# ====== Phase 1: protect technical identifiers from brand rename ======
# These cross runtime boundaries (Electron main → TS renderer, parent → child
# webview) and MUST keep the literal `openchamber` spelling. We swap them
# for unrelated placeholder strings so the brand rename in Phase 2 won't
# touch them. Phase 3 restores them.
#
# Order matters — more specific patterns first.

PROTECT=(
  's#@openchamber/#__OC_SCOPE__/#g'                    # npm scope — must stay @openchamber/
  's#__OPENCHAMBER_\([A-Z_]*\)#__OC_UPPER_\1__#g'     # __OPENCHAMBER_* window globals
  's#__openchamber\([a-zA-Z]*\)#__OC_LOWER_\1__#g'    # __openchamber* window globals (camel)
  's#__open_chamber\([a-zA-Z]*\)#__OC_SNAKE_\1__#g'    # __open_chamber* snake_case
  's#openchamber:\([a-z-]*\)#__OC_EVENT_\1__#g'        # custom DOM events openchamber:*
  's#aiworker:\([a-z-]*\)#__OC_AIW_EVENT_\1__#g'      # don't rename existing aiworker events
  's#__AIWORKER_\([A-Z_]*\)#__OC_AIW_UPPER_\1__#g'    # don't rename existing AIWORKER globals
  's#__aiworker\([a-zA-Z]*\)#__OC_AIW_LOWER_\1__#g'   # don't rename existing aiworker globals
)

# ====== Phase 2: brand rename ======
# Safe because Phase 1 already hid every literal `openchamber` that must stay.

BRAND=(
  's#github.com/openchamber/openchamber#roweb.cn/roweb/aiworker#g'
  's#OPENCHAMBER#AIWORKER#g'
  's#openchamber#aiworker#g'
  's#OpenChamber#AiWorker#g'
  's#fedaykindev#roweb#g'
  's#Fedaykindev#Roweb#g'
  's#FEDAYKINDEV#ROWEB#g'
)

# ====== Phase 3: restore protected identifiers ======

RESTORE=(
  's#__OC_SCOPE__#@openchamber#g'
  's#__OC_UPPER_\([A-Z_]*\)__#__OPENCHAMBER_\1#g'
  's#__OC_LOWER_\([a-zA-Z]*\)__#__openchamber\1#g'
  's#__OC_SNAKE_\([a-zA-Z]*\)__#__open_chamber\1#g'
  's#__OC_EVENT_\([a-z-]*\)__#openchamber:\1#g'
  's#__OC_AIW_EVENT_\([a-z-]*\)__#aiworker:\1#g'
  's#__OC_AIW_UPPER_\([A-Z_]*\)__#__AIWORKER_\1#g'
  's#__OC_AIW_LOWER_\([a-zA-Z]*\)__#__aiworker\1#g'
)

# Build sed arg arrays
PROTECT_ARGS=(); for p in "${PROTECT[@]}"; do PROTECT_ARGS+=(-e "$p"); done
BRAND_ARGS=();   for p in "${BRAND[@]}";   do BRAND_ARGS+=(-e "$p");   done
RESTORE_ARGS=(); for p in "${RESTORE[@]}"; do RESTORE_ARGS+=(-e "$p"); done

# Run all three phases in one sed invocation per file
find ${baseDir}/ ${ALL_EXTS} -exec sed -i.bak \
  "${PROTECT_ARGS[@]}" "${BRAND_ARGS[@]}" "${RESTORE_ARGS[@]}" {} +

# Special: index.html and cli-args.js must keep /openchamber as SPA base path
# The brand rename turned /openchamber into /aiworker here; undo it.
find ${baseDir}/ -type f \( -name "index.html" -o -name "cli-args.js" \) \
  -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" \
  -exec sed -i.bak -e 's#/aiworker#/openchamber#g' {} +

# cleanup .bak files
find ${baseDir}/ -name "*.bak" -type f -delete

echo "########## done ########## "
echo "$(date +%Y%m%d-%H:%M:%S) done."
