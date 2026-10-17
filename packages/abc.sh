
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

cp ${baseDir}/vscode/README_zh.md ${baseDir}/vscode/README.md 
echo "########## custom vscode extension ########## "
# Batch 1 - brand rename on ext files. Specific patterns BEFORE generic ones
# so github.com/openchamber/* isn't clobbered before it can match.
# *.cjs is included: the after-pack verifier (packaged-app-contents.cjs) and
# friends carry @openchamber/* package literals and must rename with the
# workspace packages they verify, or the packaged-contents check fails.
find ${baseDir}/../ -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.cjs" -o -name "*.html" -o -name "*.mjs" -o -name "*.json" -o -name "*.mdx" -o -name "*.md"  -o -name "*.zig"  -o -name "*.yml" \) \! -name abc.sh -not -path "*/node_modules/*" -exec sed -i.bak \
  -e 's#github.com/openchamber/openchamber#roweb.cn/roweb/aihander#g' \
  -e 's#https://x.com/openchamber_dev#https://map.roweb.cn/aihander#g' \
  -e 's#OPENCHAMBER#AIWORKER#g' \
  -e 's#openchamber#aiworker#g' \
  -e 's#OpenChamber#AiWorker#g' \
  -e 's#fedaykindev#roweb#g' \
  -e 's#https://discord.gg/ZYRSdnwwKA#https://map.roweb.cn#g' \
  -e 's#<span>Discord</span>#<span>HOME</span>#g' \
  {} +

# Batch 2 - index.html and cli-args.js (path undo comes after lowercase→aiworker)
find ${baseDir}/ -type f \( -name "index.html" -o -name "cli-args.js" \) -not -path "*/node_modules/*" -exec sed -i.bak \
  -e 's#OPENCHAMBER#AIWORKER#g' \
  -e 's#OpenChamber#AiWorker#g' \
  -e 's#/aiworker#/openchamber#g' \
  {} +

# filter - undo over-renamed identifiers that should stay openchamber-*
# (*.cjs included here too, so the same files get the same filter passes)
find ${baseDir}/../ -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.cjs" -o -name "*.mjs"  -o -name "*.html" -o -name "*.json" -o -name "*.mdx" -o -name "*.md" \) -not -path "*/node_modules/*" -exec sed -i.bak \
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

# Batch 3 - zh-CN draft preset labels translated to Simplified Chinese
# Scoped to zh-CN.ts only; value-only sed replacements, keys stay untouched.
find ${baseDir}/ui/src/lib/i18n/messages/ -type f -name "zh-CN.ts" -not -path "*/node_modules/*" -exec sed -i.bak \
  -e "s#'chat.draftPresets.explore.label': 'Explore the codebase'#'chat.draftPresets.explore.label': '探索代码库'#g" \
  -e "s#'chat.draftPresets.catchup.label': 'Catch me up'#'chat.draftPresets.catchup.label': '帮我了解最新进展'#g" \
  -e "s#'chat.draftPresets.weigh.label': 'Weigh my options'#'chat.draftPresets.weigh.label': '权衡我的选择'#g" \
  -e "s#'chat.draftPresets.plan.label': 'Start feature planning'#'chat.draftPresets.plan.label': '开始功能规划'#g" \
  -e "s#'chat.draftPresets.debug.label': 'Debug an issue'#'chat.draftPresets.debug.label': '调试问题'#g" \
  -e "s#'chat.draftPresets.review.label': 'Review my changes'#'chat.draftPresets.review.label': '审查我的更改'#g" \
  -e "s#为社区用心打造#智能研发工作台#g" \
  {} +

echo "########## zh-CN labels to Simplified Chinese ########## "
# Batch 4 - remaining zh-CN labels translated to Simplified Chinese
# Value-only sed replacements on zh-CN.ts; keys and literal terms stay untouched.
find ${baseDir}/ui/src/lib/i18n/messages/ -type f -name "zh-CN.ts" -not -path "*/node_modules/*" -exec sed -i.bak \
  -e "s#'common.language.english': 'English'#'common.language.english': '英语'#g" \
  -e "s#'gitView.history.actions.cherryPick': 'Cherry-pick'#'gitView.history.actions.cherryPick': '拣选'#g" \
  -e "s#'gitView.history.actions.reset': 'Reset...'#'gitView.history.actions.reset': '重置...'#g" \
  -e "s#'gitView.history.actions.revert': 'Revert'#'gitView.history.actions.revert': '还原'#g" \
  -e "s#'contextPanel.mode.stagedDiff': 'Staged Diff'#'contextPanel.mode.stagedDiff': '暂存的差异'#g" \
  -e "s#'contextPanel.mode.workingDiff': 'Working Diff'#'contextPanel.mode.workingDiff': '工作区差异'#g" \
  -e "s#'diffView.actions.review': 'Review'#'diffView.actions.review': '审查'#g" \
  -e "s#'diffView.actions.reviewAria': 'Review changes'#'diffView.actions.reviewAria': '审查更改'#g" \
  -e "s#'diffView.reviewDialog.title': 'Review changes'#'diffView.reviewDialog.title': '审查更改'#g" \
  -e "s#'diffView.reviewDialog.description': 'Start a separate review session for the current changes.'#'diffView.reviewDialog.description': '为当前更改启动单独的审查会话。'#g" \
  -e "s#'diffView.reviewDialog.generateHandoff': 'Generate handoff'#'diffView.reviewDialog.generateHandoff': '生成交接'#g" \
  -e "s#'diffView.reviewDialog.info': 'This flow works best if started in the session where the changes were implemented.'#'diffView.reviewDialog.info': '此流程最好从实现这些更改的会话中启动。'#g" \
  -e "s#'diffView.reviewDialog.actions.cancel': 'Cancel'#'diffView.reviewDialog.actions.cancel': '取消'#g" \
  -e "s#'diffView.reviewDialog.actions.start': 'Review'#'diffView.reviewDialog.actions.start': '审查'#g" \
  -e "s#'diffView.reviewDialog.actions.starting': 'Starting...'#'diffView.reviewDialog.actions.starting': '正在启动...'#g" \
  -e "s#'diffView.reviewDialog.toast.noSessionDirectory': 'Session directory is unavailable'#'diffView.reviewDialog.toast.noSessionDirectory': '会话目录不可用'#g" \
  -e "s#'diffView.reviewDialog.toast.startFailed': 'Failed to start review flow'#'diffView.reviewDialog.toast.startFailed': '启动审查流程失败'#g" \
  -e "s#'desktopHostSwitcher.instance.local': 'Local'#'desktopHostSwitcher.instance.local': '本地'#g" \
  -e "s#'common.date.today': 'Today'#'common.date.today': '今天'#g" \
  -e "s#'common.date.yesterday': 'Yesterday'#'common.date.yesterday': '昨天'#g" \
  -e "s#'common.date.yesterdayWithTime': 'Yesterday {time}'#'common.date.yesterdayWithTime': '昨天 {time}'#g" \
  -e "s#'common.relative.justNow': 'Just now'#'common.relative.justNow': '刚刚'#g" \
  -e "s#'common.relative.minutesAgoShort': '{count}min ago'#'common.relative.minutesAgoShort': '{count} 分钟前'#g" \
  -e "s#'common.relative.hoursAgoShort': '{count}h ago'#'common.relative.hoursAgoShort': '{count} 小时前'#g" \
  -e "s#'common.relative.daysAgoShort': '{count}d ago'#'common.relative.daysAgoShort': '{count} 天前'#g" \
  -e "s#'common.relative.weeksAgoShort': '{count}w ago'#'common.relative.weeksAgoShort': '{count} 周前'#g" \
  -e "s#'common.relative.yearsAgoShort': '{count}y ago'#'common.relative.yearsAgoShort': '{count} 年前'#g" \
  -e "s#'common.relative.daysAgoCompact': '{count}d ago'#'common.relative.daysAgoCompact': '{count} 天前'#g" \
  -e "s#'common.relative.weeksAgoCompact': '{count}w ago'#'common.relative.weeksAgoCompact': '{count} 周前'#g" \
  -e "s#'common.relative.yearsAgoCompact': '{count}y ago'#'common.relative.yearsAgoCompact': '{count} 年前'#g" \
  -e "s#'contextFileOpen.failure.tooLarge': 'File is too large to open (>{count} lines)'#'contextFileOpen.failure.tooLarge': '文件过大，无法打开（超过 {count} 行）'#g" \
  -e "s#'contextFileOpen.failure.missing': 'File not found'#'contextFileOpen.failure.missing': '找不到文件'#g" \
  -e "s#'contextFileOpen.failure.unreadable': 'Failed to open file'#'contextFileOpen.failure.unreadable': '无法打开文件'#g" \
  -e "s#'quota.window.5h': '5-Hour'#'quota.window.5h': '5 小时'#g" \
  -e "s#'quota.window.7d': '7-Day Limit'#'quota.window.7d': '7 天限额'#g" \
  -e "s#'quota.window.daily': 'Daily'#'quota.window.daily': '每日'#g" \
  -e "s#'quota.window.credits': 'Credits'#'quota.window.credits': '积分'#g" \
  -e "s#'quota.window.creditsBalance': 'Credits Balance'#'quota.window.creditsBalance': '积分余额'#g" \
  -e "s#'quota.window.billingCycle': 'Billing Cycle'#'quota.window.billingCycle': '计费周期'#g" \
  -e "s#'quota.window.auto': 'Auto'#'quota.window.auto': '自动'#g" \
  -e "s#'quota.window.planLimit': 'Plan Limit'#'quota.window.planLimit': '套餐限额'#g" \
  -e "s#'quota.window.onDemand': 'On-demand'#'quota.window.onDemand': '按需'#g" \
  -e "s#'quota.window.session': 'Session'#'quota.window.session': '会话'#g" \
  -e "s#'quota.window.premium': 'Premium Interactions'#'quota.window.premium': '高级交互'#g" \
  -e "s#'quota.window.chat': 'Chat Requests'#'quota.window.chat': '聊天请求'#g" \
  -e "s#'quota.window.completions': 'Completions'#'quota.window.completions': '补全'#g" \
  -e "s#'chat.workStatus.telemetry.tokens': 'Token'#'chat.workStatus.telemetry.tokens': '令牌'#g" \
  -e "s#'chat.emptyState.draftTitle': 'What are we working on?'#'chat.emptyState.draftTitle': '我们接下来做什么？'#g" \
  -e "s#'chat.emptyState.draftTitleWithProject': 'What are we working on in {project}?'#'chat.emptyState.draftTitleWithProject': '在 {project} 中我们接下来做什么？'#g" \
  -e "s#'chat.draftStarters.add': 'Add a starter'#'chat.draftStarters.add': '添加启动器'#g" \
  -e "s#'chat.draftStarters.searchPlaceholder': 'Search commands and skills…'#'chat.draftStarters.searchPlaceholder': '搜索命令和技能…'#g" \
  -e "s#'chat.draftStarters.empty': 'Nothing to add'#'chat.draftStarters.empty': '没有可添加的内容'#g" \
  -e "s#'chat.draftStarters.sectionBuiltIn': 'Built-in'#'chat.draftStarters.sectionBuiltIn': '内置'#g" \
  -e "s#'chat.draftStarters.sectionCommands': 'Commands'#'chat.draftStarters.sectionCommands': '命令'#g" \
  -e "s#'chat.draftStarters.sectionSkills': 'Skills'#'chat.draftStarters.sectionSkills': '技能'#g" \
  -e "s#'chat.draftStarters.remove': 'Remove'#'chat.draftStarters.remove': '移除'#g" \
  -e "s#'chat.queuedMessage.title': 'Queued messages'#'chat.queuedMessage.title': '队列中的消息'#g" \
  -e "s#'chat.queuedMessage.edit': 'edit'#'chat.queuedMessage.edit': '编辑'#g" \
  -e "s#'chat.queuedMessage.send': 'send'#'chat.queuedMessage.send': '发送'#g" \
  -e "s#'session.githubIntegration.tabs.issues': 'Issues'#'session.githubIntegration.tabs.issues': '问题'#g" \
  -e "s#'session.githubIntegration.tabs.pullRequests': 'Pull Requests'#'session.githubIntegration.tabs.pullRequests': '拉取请求'#g" \
  {} +

# cleanup .bak files (the sed batches above run over the whole repo, not just
# packages/, so clean the same scope)
find ${baseDir}/../ -name "*.bak" -type f -not -path "*/node_modules/*" -delete
