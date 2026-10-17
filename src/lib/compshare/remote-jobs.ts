// 远程持久作业协议(移植自 compshare_cli/remote_jobs.py)
// 生成器模式: 每个操作输出一段 POSIX shell 脚本, 在实例上执行后按 COMPSHARE_JOB_* tab+base64 协议回传记录。

import {createHash, randomBytes} from 'node:crypto'

import {UsageError} from './errors.js'
import {shlexJoin, shlexQuote} from './parsing.js'

// #region 常量与校验

// 作业 ID 规则: 1-64 位, 以字母或数字开头
export const JOB_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

// 作业状态全集
export const JOB_STATES: readonly string[] = [
  'Starting',
  'Running',
  'Cancelling',
  'Succeeded',
  'Failed',
  'Cancelled',
  'Interrupted',
]

// 远程作业助手返回了畸形或错误输出
export class RemoteJobProtocolError extends UsageError {}

// 生成客户端幂等作业 ID: job-UTC时间戳-8位随机hex
export function newJobId(): string {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  const stamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
  return `job-${stamp}-${randomBytes(4).toString('hex')}`
}

// 校验作业 ID
export function validateJobId(value: string): string {
  if (!JOB_ID_PATTERN.test(value)) {
    throw new UsageError('作业 ID 必须为 1-64 位字母/数字/点/下划线/连字符, 且以字母或数字开头。')
  }
  return value
}

// 把助手脚本包装为一条安全引用的 OpenSSH 远程命令
export function shellCommand(script: string): string {
  return `sh -c ${shlexQuote(script)}`
}

// 把参数列表拼成一条远程命令
export function joinedCommand(arguments_: readonly string[]): string {
  if (arguments_.length === 0) {
    throw new UsageError('请在 -- 之后提供远程命令。')
  }
  return shlexJoin(arguments_)
}

// #endregion

// #region 脚本片段

// 各操作共享的助手函数(与 Python 端逐字对齐; shell 的 ${...} 需转义避免 TS 插值)
const COMMON_SCRIPT = `
set -u
umask 077

state_home=\${XDG_STATE_HOME:-}
case "$state_home" in
  /*) ;;
  *)
    if [ -z "\${HOME:-}" ]; then
      printf 'COMPSHARE_JOB_ERROR\\t%s\\n' \\
        "$(printf '%s' 'HOME is not set on the instance.' | base64 | tr -d '\\n')"
      exit 70
    fi
    state_home=$HOME/.local/state
    ;;
esac
jobs_root=$state_home/compshare/jobs
if ! mkdir -p "$jobs_root"; then
  job_directory_error="Unable to create remote job directory: $jobs_root"
  printf 'COMPSHARE_JOB_ERROR\\t%s\\n' \\
    "$(printf '%s' "$job_directory_error" | base64 | tr -d '\\n')"
  exit 73
fi

emit_value() {
  emit_key=$1
  emit_value=\${2-}
  printf 'COMPSHARE_JOB_FIELD\\t%s\\t' "$emit_key"
  printf '%s' "$emit_value" | base64 | tr -d '\\n'
  printf '\\n'
}

emit_file() {
  emit_key=$1
  emit_path=$2
  printf 'COMPSHARE_JOB_FIELD\\t%s\\t' "$emit_key"
  if [ -f "$emit_path" ]; then
    base64 < "$emit_path" | tr -d '\\n'
  fi
  printf '\\n'
}

emit_error() {
  printf 'COMPSHARE_JOB_ERROR\\t'
  printf '%s' "$1" | base64 | tr -d '\\n'
  printf '\\n'
  exit "\${2:-1}"
}

read_value() {
  if [ -f "$1" ]; then
    cat "$1"
  fi
}

process_matches() {
  process_dir=$1
  process_pid=$(read_value "$process_dir/pid")
  case "$process_pid" in
    ''|*[!0-9]*) return 1 ;;
  esac
  if [ "$process_pid" -le 1 ] || ! kill -0 "$process_pid" 2>/dev/null; then
    return 1
  fi

  stored_boot=$(read_value "$process_dir/boot_id")
  if [ -n "$stored_boot" ] && [ -r /proc/sys/kernel/random/boot_id ]; then
    current_boot=$(cat /proc/sys/kernel/random/boot_id 2>/dev/null || true)
    if [ -n "$current_boot" ] && [ "$stored_boot" != "$current_boot" ]; then
      return 1
    fi
  fi

  stored_start=$(read_value "$process_dir/process_start")
  if [ -n "$stored_start" ] && [ -r "/proc/$process_pid/stat" ]; then
    current_start=$(awk '{print $22}' "/proc/$process_pid/stat" 2>/dev/null || true)
    if [ -n "$current_start" ] && [ "$stored_start" != "$current_start" ]; then
      return 1
    fi
  fi
  return 0
}

job_state() {
  state_dir=$1
  if [ -f "$state_dir/cancelled" ]; then
    printf '%s' Cancelled
    return
  fi
  if [ -f "$state_dir/exit_code" ]; then
    state_exit=$(read_value "$state_dir/exit_code")
    if [ "$state_exit" = 0 ]; then
      printf '%s' Succeeded
    else
      printf '%s' Failed
    fi
    return
  fi
  if process_matches "$state_dir"; then
    if [ -f "$state_dir/cancel_requested" ]; then
      printf '%s' Cancelling
    else
      printf '%s' Running
    fi
    return
  fi
  if [ -f "$state_dir/pid" ]; then
    printf '%s' Interrupted
  else
    printf '%s' Starting
  fi
}

emit_job() {
  emit_dir=$1
  emit_existing=\${2:-false}
  printf 'COMPSHARE_JOB_BEGIN\\n'
  emit_value JobId "$(basename "$emit_dir")"
  emit_file Name "$emit_dir/name"
  emit_value State "$(job_state "$emit_dir")"
  emit_file PID "$emit_dir/pid"
  emit_file ExitCode "$emit_dir/exit_code"
  emit_file CreatedTime "$emit_dir/created_at"
  emit_file StartedTime "$emit_dir/started_at"
  emit_file FinishedTime "$emit_dir/finished_at"
  emit_file Cwd "$emit_dir/cwd"
  emit_file Command "$emit_dir/command"
  emit_value Existing "$emit_existing"
  printf 'COMPSHARE_JOB_END\\n'
}
`

// 作业守护进程: 记录 PID/boot_id/启动时间, 转发信号并落盘退出码
const RUNNER_SCRIPT = `#!/bin/sh
set -u
umask 077
job_dir=$1
finished=0
child_pid=

atomic_value() {
  atomic_target=$1
  atomic_value=\${2-}
  atomic_temp=$atomic_target.tmp.$$
  printf '%s\\n' "$atomic_value" > "$atomic_temp"
  mv "$atomic_temp" "$atomic_target"
}

finish_job() {
  finish_code=$1
  if [ "$finished" -ne 0 ]; then
    return
  fi
  finished=1
  atomic_value "$job_dir/finished_at" "$(date +%s)"
  atomic_value "$job_dir/exit_code" "$finish_code"
}

cancel_job() {
  trap - TERM INT HUP
  if [ -n "$child_pid" ]; then
    kill -TERM "$child_pid" 2>/dev/null || true
  fi
  : > "$job_dir/cancelled.tmp.$$"
  mv "$job_dir/cancelled.tmp.$$" "$job_dir/cancelled"
  finish_job 143
  exit 143
}

trap cancel_job TERM INT HUP
atomic_value "$job_dir/pid" "$$"
if [ -r /proc/sys/kernel/random/boot_id ]; then
  atomic_value "$job_dir/boot_id" "$(cat /proc/sys/kernel/random/boot_id 2>/dev/null || true)"
fi
if [ -r "/proc/$$/stat" ]; then
  atomic_value "$job_dir/process_start" "$(awk '{print $22}' "/proc/$$/stat" 2>/dev/null || true)"
fi
atomic_value "$job_dir/started_at" "$(date +%s)"

if [ -f "$job_dir/cancel_requested" ]; then
  cancel_job
fi

job_cwd=$(cat "$job_dir/cwd")
if [ -n "$job_cwd" ] && ! cd "$job_cwd"; then
  printf 'Unable to enter working directory: %s\\n' "$job_cwd" >> "$job_dir/stderr.log"
  finish_job 125
  exit 125
fi

job_command=$(cat "$job_dir/command")
sh -c "$job_command" >> "$job_dir/stdout.log" 2>> "$job_dir/stderr.log" &
child_pid=$!
atomic_value "$job_dir/child_pid" "$child_pid"
wait "$child_pid"
job_exit=$?
child_pid=
finish_job "$job_exit"
exit "$job_exit"
`

// #endregion

// #region 各操作脚本生成器

// 提交作业(幂等): 同 ID 且 同命令+工作目录 时直接返回 Existing 记录
export function submitScript(
  jobId: string,
  command: string,
  options: {cwd?: string; name?: string;} = {},
): string {
  validateJobId(jobId)
  // 规范指纹 = 命令 + NUL + 工作目录, 用于识别"同 ID 不同内容"的冲突
  const specification = `${command}\0${options.cwd ?? ''}`
  const specificationHash = createHash('sha256').update(specification, 'utf8').digest('hex')
  return (
    COMMON_SCRIPT +
    `
job_id=${shlexQuote(jobId)}
job_dir=$jobs_root/$job_id
specification_hash=${shlexQuote(specificationHash)}
if [ -d "$job_dir" ]; then
  existing_hash=$(read_value "$job_dir/specification_sha256")
  if [ "$existing_hash" != "$specification_hash" ]; then
    emit_error "Job $job_id already exists with a different command or working directory." 65
  fi
  emit_job "$job_dir" true
  exit 0
fi

if ! mkdir "$job_dir"; then
  emit_error "Unable to create remote job $job_id." 73
fi
chmod 700 "$job_dir" 2>/dev/null || true
printf '%s' ${shlexQuote(command)} > "$job_dir/command"
printf '%s' ${shlexQuote(options.name ?? '')} > "$job_dir/name"
printf '%s' ${shlexQuote(options.cwd ?? '')} > "$job_dir/cwd"
printf '%s\n' "$specification_hash" > "$job_dir/specification_sha256"
printf '%s\n' "$(date +%s)" > "$job_dir/created_at"
: > "$job_dir/stdout.log"
: > "$job_dir/stderr.log"
cat > "$job_dir/runner.sh" <<'COMPSHARE_JOB_RUNNER'
${RUNNER_SCRIPT}COMPSHARE_JOB_RUNNER
chmod 700 "$job_dir/runner.sh"

fail_launch() {
  launch_code=$1
  launch_message=$2
  printf '%s\n' "$launch_message" >> "$job_dir/stderr.log"
  printf '%s\n' "$launch_code" > "$job_dir/exit_code.tmp.$$"
  mv "$job_dir/exit_code.tmp.$$" "$job_dir/exit_code"
  printf '%s\n' "$(date +%s)" > "$job_dir/finished_at.tmp.$$"
  mv "$job_dir/finished_at.tmp.$$" "$job_dir/finished_at"
  emit_error "$launch_message" "$launch_code"
}

if ! command -v setsid >/dev/null 2>&1; then
  fail_launch 69 "setsid is required on the instance to start durable jobs."
fi
if ! command -v nohup >/dev/null 2>&1; then
  fail_launch 69 "nohup is required on the instance to start durable jobs."
fi

nohup setsid "$job_dir/runner.sh" "$job_dir" </dev/null >> "$job_dir/launcher.log" 2>&1 &
launcher_pid=$!
attempt=0

while :; do
  if ! kill -0 "$launcher_pid" 2>/dev/null; then
    break
  fi
  attempt=$((attempt + 1))
  sleep 0.05
done
if [ ! -s "$job_dir/pid" ]; then
  kill "$launcher_pid" 2>/dev/null || true
  launcher_error=$(cat "$job_dir/launcher.log" 2>/dev/null || true)
  fail_launch 70 "Unable to start remote job $job_id: $launcher_error"
fi
emit_job "$job_dir" false
`
  )
}

// 查询单个作业状态
export function showScript(jobId: string): string {
  validateJobId(jobId)
  return (
    COMMON_SCRIPT +
    `
job_id=${shlexQuote(jobId)}
job_dir=$jobs_root/$job_id
[ -d "$job_dir" ] || emit_error "Remote job $job_id was not found." 66
emit_job "$job_dir" false
`
  )
}

// 列出全部作业
export function listScript(): string {
  return (
    COMMON_SCRIPT +
    `
for job_dir in "$jobs_root"/*; do
  [ -d "$job_dir" ] || continue
  emit_job "$job_dir" false
done
`
  )
}

// 读取日志: tail 模式按行尾读取, offset 模式按字节区间读取
export function logsScript(
  jobId: string,
  options: {limit: number; stderrOffset?: number; stdoutOffset?: number; tail: number | null;},
): string {
  validateJobId(jobId)
  if (options.tail !== null && options.tail < 1) {
    throw new UsageError('--tail 必须为正整数。')
  }
  if (options.stdoutOffset !== undefined && options.stdoutOffset < 0) {
    throw new UsageError('--stdout-offset 不能为负数。')
  }
  if (options.stderrOffset !== undefined && options.stderrOffset < 0) {
    throw new UsageError('--stderr-offset 不能为负数。')
  }
  if (options.limit < 1) {
    throw new UsageError('--limit 必须为正整数。')
  }
  const isOffsetMode = options.stdoutOffset !== undefined || options.stderrOffset !== undefined
  const stdoutOffset = options.stdoutOffset ?? 0
  const stderrOffset = options.stderrOffset ?? 0
  let contentScript: string
  if (isOffsetMode) {
    contentScript = `
emit_value Mode offset
emit_value Limit ${options.limit}
emit_value StdoutOffset ${stdoutOffset}
emit_value StderrOffset ${stderrOffset}
printf 'COMPSHARE_JOB_FIELD\\tStdout\\t'
dd if="$job_dir/stdout.log" bs=1 skip=${stdoutOffset} count=${options.limit} 2>/dev/null \\
  | base64 | tr -d '\\n'
printf '\\n'
printf 'COMPSHARE_JOB_FIELD\\tStderr\\t'
dd if="$job_dir/stderr.log" bs=1 skip=${stderrOffset} count=${options.limit} 2>/dev/null \\
  | base64 | tr -d '\\n'
printf '\\n'
`
  } else {
    const selectedTail = options.tail ?? 200
    contentScript = `
emit_value Mode tail
emit_value Tail ${selectedTail}
printf 'COMPSHARE_JOB_FIELD\\tStdout\\t'
tail -n ${selectedTail} "$job_dir/stdout.log" 2>/dev/null | base64 | tr -d '\\n'
printf '\\n'
printf 'COMPSHARE_JOB_FIELD\\tStderr\\t'
tail -n ${selectedTail} "$job_dir/stderr.log" 2>/dev/null | base64 | tr -d '\\n'
printf '\\n'
`
  }
  return (
    COMMON_SCRIPT +
    `
job_id=${shlexQuote(jobId)}
job_dir=$jobs_root/$job_id
[ -d "$job_dir" ] || emit_error "Remote job $job_id was not found." 66
stdout_size=$(wc -c < "$job_dir/stdout.log" | tr -d ' ')
stderr_size=$(wc -c < "$job_dir/stderr.log" | tr -d ' ')
printf 'COMPSHARE_JOB_BEGIN\n'
emit_value JobId "$job_id"
emit_value State "$(job_state "$job_dir")"
emit_value StdoutSize "$stdout_size"
emit_value StderrSize "$stderr_size"
${contentScript}
printf 'COMPSHARE_JOB_END\n'
`
  )
}

// 持续跟踪日志直到作业结束(远端 tail -F)
export function followScript(jobId: string, options: {stream: string; tail: number;}): string {
  validateJobId(jobId)
  if (options.tail < 1) {
    throw new UsageError('--tail 必须为正整数。')
  }
  let files: string
  if (options.stream === 'stdout') {
    files = '"$job_dir/stdout.log"'
  } else if (options.stream === 'stderr') {
    files = '"$job_dir/stderr.log"'
  } else {
    files = '"$job_dir/stdout.log" "$job_dir/stderr.log"'
  }
  return (
    COMMON_SCRIPT +
    `
job_id=${shlexQuote(jobId)}
job_dir=$jobs_root/$job_id
[ -d "$job_dir" ] || {
  printf 'Remote job %s was not found.\n' "$job_id" >&2
  exit 66
}
current_state=$(job_state "$job_dir")
case "$current_state" in
  Succeeded|Failed|Cancelled|Interrupted)
    tail -n ${options.tail} ${files}
    exit 0
    ;;
esac
tail -n ${options.tail} -F ${files} &
tail_pid=$!
trap 'kill "$tail_pid" 2>/dev/null || true; exit 130' INT TERM HUP
while :; do
  current_state=$(job_state "$job_dir")
  case "$current_state" in
    Succeeded|Failed|Cancelled|Interrupted) break ;;
  esac
  sleep 1
done
sleep 0.2
kill "$tail_pid" 2>/dev/null || true
wait "$tail_pid" 2>/dev/null || true
`
  )
}

// 轮询等待作业结束, 超时返回 WaitTimedOut 记录
export function waitScript(jobId: string, options: {interval: number; timeout: number;}): string {
  validateJobId(jobId)
  if (options.timeout < 1 || options.interval < 1) {
    throw new UsageError('等待超时与轮询间隔必须为正整数。')
  }
  return (
    COMMON_SCRIPT +
    `
job_id=${shlexQuote(jobId)}
job_dir=$jobs_root/$job_id
[ -d "$job_dir" ] || emit_error "Remote job $job_id was not found." 66
started_wait=$(date +%s)
wait_timed_out=false
while :; do
  current_state=$(job_state "$job_dir")
  case "$current_state" in
    Succeeded|Failed|Cancelled|Interrupted) break ;;
  esac
  current_time=$(date +%s)
  if [ $((current_time - started_wait)) -ge ${options.timeout} ]; then
    wait_timed_out=true
    break
  fi
  sleep ${options.interval}
done
emit_job "$job_dir" false
printf 'COMPSHARE_JOB_BEGIN\n'
emit_value WaitTimedOut "$wait_timed_out"
printf 'COMPSHARE_JOB_END\n'
`
  )
}

// 取消作业: 默认 TERM, --force 用 KILL 并直接落盘 137 退出码
export function cancelScript(jobId: string, options: {force: boolean}): string {
  validateJobId(jobId)
  const signal = options.force ? 'KILL' : 'TERM'
  const forcedBlock = options.force
    ? `
sleep 0.2
: > "$job_dir/cancelled.tmp.$$"
mv "$job_dir/cancelled.tmp.$$" "$job_dir/cancelled"
printf '%s\n' 137 > "$job_dir/exit_code.tmp.$$"
mv "$job_dir/exit_code.tmp.$$" "$job_dir/exit_code"
printf '%s\n' "$(date +%s)" > "$job_dir/finished_at.tmp.$$"
mv "$job_dir/finished_at.tmp.$$" "$job_dir/finished_at"
`
    : 'sleep 0.2\n'
  return (
    COMMON_SCRIPT +
    `
job_id=${shlexQuote(jobId)}
job_dir=$jobs_root/$job_id
[ -d "$job_dir" ] || emit_error "Remote job $job_id was not found." 66
current_state=$(job_state "$job_dir")
case "$current_state" in
  Succeeded|Failed|Cancelled|Interrupted)
    emit_job "$job_dir" false
    exit 0
    ;;
esac
: > "$job_dir/cancel_requested"
job_pid=$(read_value "$job_dir/pid")
case "$job_pid" in
  ''|*[!0-9]*) ;;
  *)
    if [ "$job_pid" -gt 1 ] && process_matches "$job_dir"; then
      kill -${signal} "-$job_pid" 2>/dev/null || kill -${signal} "$job_pid" 2>/dev/null || true
    fi
    ;;
esac
${forcedBlock}
emit_job "$job_dir" false
`
  )
}

// 清理已结束的旧作业记录与日志
export function pruneScript(options: {delete: boolean; olderThan: number;}): string {
  if (options.olderThan < 1) {
    throw new UsageError('清理时长必须为正数。')
  }
  const deleteCommand = options.delete ? 'rm -rf "$job_dir"' : ':'
  return (
    COMMON_SCRIPT +
    `
now=$(date +%s)
for job_dir in "$jobs_root"/*; do
  [ -d "$job_dir" ] || continue
  current_state=$(job_state "$job_dir")
  case "$current_state" in
    Succeeded|Failed|Cancelled|Interrupted) ;;
    *) continue ;;
  esac
  reference_time=$(read_value "$job_dir/finished_at")
  if [ -z "$reference_time" ]; then
    reference_time=$(read_value "$job_dir/created_at")
  fi
  case "$reference_time" in
    ''|*[!0-9]*) continue ;;
  esac
  if [ $((now - reference_time)) -lt ${options.olderThan} ]; then
    continue
  fi
  emit_job "$job_dir" false
  ${deleteCommand}
done
`
  )
}

// #endregion

// #region 协议解析

// 解析 COMPSHARE_JOB_BEGIN/END 记录流, 字段值为 base64
export function parseRecords(output: string): Array<Record<string, string>> {
  const records: Array<Record<string, string>> = []
  let current: Record<string, string> | null = null
  for (const rawLine of output.split(/\r?\n/)) {
    if (!rawLine) {
      continue
    }
    if (rawLine === 'COMPSHARE_JOB_BEGIN') {
      if (current !== null) {
        throw new RemoteJobProtocolError('远程作业响应包含嵌套记录。')
      }
      current = {}
      continue
    }
    if (rawLine === 'COMPSHARE_JOB_END') {
      if (current === null) {
        throw new RemoteJobProtocolError('远程作业响应结束了一条未知记录。')
      }
      records.push(current)
      current = null
      continue
    }
    const parts = rawLine.split('\t')
    if (parts[0] === 'COMPSHARE_JOB_ERROR' && parts.length === 2) {
      throw new RemoteJobProtocolError(decodeField(parts[1] as string))
    }
    if (parts[0] === 'COMPSHARE_JOB_FIELD' && parts.length === 3 && current !== null) {
      current[parts[1] as string] = decodeField(parts[2] as string)
      continue
    }
    if (current === null && !rawLine.startsWith('COMPSHARE_JOB_')) {
      continue
    }
    throw new RemoteJobProtocolError('远程作业响应使用了不支持的格式。')
  }
  if (current !== null) {
    throw new RemoteJobProtocolError('远程作业响应在记录结束前中断。')
  }
  return records
}

// 归一化记录: 数字字段转 int, 布尔字段转 bool, offset 模式补充游标
export function normalizedRecord(record: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {...record}
  const numericKeys = [
    'PID',
    'ExitCode',
    'CreatedTime',
    'StartedTime',
    'FinishedTime',
    'StdoutOffset',
    'StderrOffset',
    'StdoutSize',
    'StderrSize',
    'Tail',
    'Limit',
  ]
  for (const key of numericKeys) {
    if (!(key in result)) {
      continue
    }
    const value = result[key]
    if (value === undefined || value === null || value === '') {
      result[key] = null
      continue
    }
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      result[key] = parsed
    }
  }
  for (const key of ['Existing', 'WaitTimedOut']) {
    const value = result[key]
    if (value !== undefined && value !== null) {
      result[key] = String(value).toLowerCase() === 'true'
    }
  }
  if (result.Mode === 'offset') {
    for (const stream of ['Stdout', 'Stderr'] as const) {
      const size = Number(result[`${stream}Size`] ?? 0) || 0
      const offset = Number(result[`${stream}Offset`] ?? 0) || 0
      const limit = Number(result.Limit ?? 0) || 0
      // 游标前进量不超过流末尾: min(size, offset + limit)
      const nextOffset = Math.min(size, offset + limit)
      result[`${stream}NextOffset`] = nextOffset
      result[`${stream}EOF`] = nextOffset >= size
    }
  }
  return result
}

// base64 解码(严格校验字符集与长度, 非法即协议错误)
function decodeField(value: string): string {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new RemoteJobProtocolError('远程作业响应包含非法的 Base64 数据。')
  }
  return Buffer.from(value, 'base64').toString('utf8')
}

// #endregion
