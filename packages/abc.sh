
#!/bin/bash

baseDir=$(cd `dirname $0`;pwd)
cd $baseDir
execStartTime=`date +%Y%m%d-%H:%M:%S`

echo "${execStartTime} Exe Dir: $baseDir"
xsed='sed -i'
system=`uname`
if [ "$system" == "Darwin" ]; then
  echo "This is macOS"
  xsed="sed -i .bak"
else
  echo "This is Linux"
  xsed='sed -i'
fi  

# file set definitions (DRY)
FIND_EXTS='-type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.json" -o -name "*.mdx" -o -name "*.md" \) -not -path "*/node_modules/*"'
FIND_SPECIAL='-type f \( -name "index.html" -o -name "cli-args.js" \) -not -path "*/node_modules/*"'

echo "########## custom vscode extension ########## "
# Batch 1 - brand rename on ext files. Specific patterns BEFORE generic ones
# so github.com/openchamber/* isn't clobbered before it can match.
find ${baseDir}/ ${FIND_EXTS} -exec sed -i.bak \
  -e 's#github.com/openchamber/openchamber#roweb.cn/roweb/aiworker#g' \
  -e 's#OPENCHAMBER#AIWORKER#g' \
  -e 's#openchamber#aiworker#g' \
  -e 's#OpenChamber#AiWorker#g' \
  -e 's#fedaykindev#roweb#g' \
  {} +

# Batch 2 - index.html and cli-args.js (path undo comes after lowercase→aiworker)
find ${baseDir}/ ${FIND_SPECIAL} -exec sed -i.bak \
  -e 's#OPENCHAMBER#AIWORKER#g' \
  -e 's#OpenChamber#AiWorker#g' \
  -e 's#/aiworker#/openchamber#g' \
  {} +

# filter - undo over-renamed identifiers that should stay openchamber-*
find ${baseDir}/ ${FIND_EXTS} -exec sed -i.bak \
  -e 's#aiworkerConfig#openchamberConfig#g' \
  -e 's#aiworkerEvents#openchamberEvents#g' \
  -e 's#aiworker-route#openchamber-route#g' \
  -e 's#aiworker-logo#openchamber-logo#g' \
  -e 's#aiworker-#openchamber-#g' \
  -e 's#/aiworker#/openchamber#g' \
  -e 's#AiWorkerLogo#OpenChamberLogo#g' \
  -e 's#AiWorkerPage#OpenChamberPage#g' \
  -e 's#AiWorkerTools#OpenChamberTools#g' \
  -e 's#AiWorkerVisual#OpenChamberVisual#g' \
  -e 's#AiWorkerWidget#OpenChamberWidget#g' \
  -e 's#AiWorkerNotifi#OpenChamberNotifi#g' \
  {} +

# cleanup .bak files
find ${baseDir}/ -name "*.bak" -type f -delete
