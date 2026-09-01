
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

echo "########## custom vscode extension ########## "
find ${baseDir}/ -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.json" -o -name "*.mdx" -o -name "*.md" \) -not -path "*/node_modules/*" | xargs -I@ bash -c "${xsed} -i.bak 's#OPENCHAMBER#AIWORKER#g' @"
find ${baseDir}/ -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.json" -o -name "*.mdx" -o -name "*.md" \) -not -path "*/node_modules/*" | xargs -I@ bash -c "${xsed} -i.bak 's#openchamber#aiworker#g' @"
find ${baseDir}/ -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.json" -o -name "*.mdx" -o -name "*.md" \) -not -path "*/node_modules/*" | xargs -I@ bash -c "${xsed} -i.bak 's#OpenChamber#AiWorker#g' @"
find ${baseDir}/ -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.json" -o -name "*.mdx" -o -name "*.md" \) -not -path "*/node_modules/*" | xargs -I@ bash -c "${xsed} -i.bak 's#fedaykindev#roweb#g' @"
find ${baseDir}/ -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.json" -o -name "*.mdx" -o -name "*.md" \) -not -path "*/node_modules/*" | xargs -I@ bash -c "${xsed} -i.bak 's#github.com/openchamber/openchamber#roweb.cn/roweb/aiworker#g' @"

# filter
find ${baseDir}/ -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.json" -o -name "*.mdx" -o -name "*.md" \) -not -path "*/node_modules/*" | xargs -I@ bash -c "${xsed} -i.bak 's#aiworkerConfig#openchamberConfig#g' @"
find ${baseDir}/ -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.json" -o -name "*.mdx" -o -name "*.md" \) -not -path "*/node_modules/*" | xargs -I@ bash -c "${xsed} -i.bak 's#aiworkerEvents#openchamberEvents#g' @"
find ${baseDir}/ -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.json" -o -name "*.mdx" -o -name "*.md" \) -not -path "*/node_modules/*" | xargs -I@ bash -c "${xsed} -i.bak 's#aiworker-route#openchamber-route#g' @"
find ${baseDir}/ -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.json" -o -name "*.mdx" -o -name "*.md" \) -not -path "*/node_modules/*" | xargs -I@ bash -c "${xsed} -i.bak 's#aiworker-logo#openchamber-logo#g' @"
find ${baseDir}/ -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.json" -o -name "*.mdx" -o -name "*.md" \) -not -path "*/node_modules/*" | xargs -I@ bash -c "${xsed} -i.bak 's#aiworker-#openchamber-#g' @"
find ${baseDir}/ -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.json" -o -name "*.mdx" -o -name "*.md" \) -not -path "*/node_modules/*" | xargs -I@ bash -c "${xsed} -i.bak 's#AiWorkerLogo#OpenChamberLogo#g' @"
find ${baseDir}/ -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.json" -o -name "*.mdx" -o -name "*.md" \) -not -path "*/node_modules/*" | xargs -I@ bash -c "${xsed} -i.bak 's#AiWorkerPage#OpenChamberPage#g' @"
find ${baseDir}/ -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.json" -o -name "*.mdx" -o -name "*.md" \) -not -path "*/node_modules/*" | xargs -I@ bash -c "${xsed} -i.bak 's#AiWorkerTools#OpenChamberTools#g' @"
find ${baseDir}/ -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.json" -o -name "*.mdx" -o -name "*.md" \) -not -path "*/node_modules/*" | xargs -I@ bash -c "${xsed} -i.bak 's#AiWorkerVisual#OpenChamberVisual#g' @"
find ${baseDir}/ -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.json" -o -name "*.mdx" -o -name "*.md" \) -not -path "*/node_modules/*" | xargs -I@ bash -c "${xsed} -i.bak 's#AiWorkerWidget#OpenChamberWidget#g' @"
find ${baseDir}/ -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.json" -o -name "*.mdx" -o -name "*.md" \) -not -path "*/node_modules/*" | xargs -I@ bash -c "${xsed} -i.bak 's#AiWorkerNotifi#OpenChamberNotifi#g' @"
find ${baseDir}/ -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.json" -o -name "*.mdx" -o -name "*.md" \) -not -path "*/node_modules/*" | xargs -I@ bash -c "${xsed} -i.bak 's#AiWorkerNotifi#OpenChamberNotifi#g' @"