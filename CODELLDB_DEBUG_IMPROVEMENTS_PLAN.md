# CodeLLDB Debug Improvements Implementation Plan

## Project Goals
1. **Fix LLDB Remote Connection** - Enable proper lldb-server connectivity
2. **Fix Debug Server Cleanup Bug** - Prevent orphaned debug server processes
3. **Future: Smart Server Detection** (postponed - see rationale below)

## Current Progress ✅

### 1. Fixed LLDB Remote Connection (COMPLETED)
**Issue**: `createLldbAttachConfig` was doing direct launch instead of connecting to remote server

**Fix Applied**: Added missing `initCommands` to `src/languages/plugins/cpp-language-plugin.ts:297`
```typescript
initCommands: [
    `gdb-remote 127.0.0.1:${port}`
]
```

**Status**: ✅ Code changed, needs testing

### 2. Research Completed (COMPLETED)
- **VS Code Documentation**: Understanding launch vs attach configurations
- **CodeLLDB Manual**: How `gdb-remote` command works
- **Current Implementation**: Analysis of existing cppdbg vs lldb configurations

**Key Findings**:
- `cppdbg`: Uses `miDebuggerServerAddress: "127.0.0.1:${port}"` (already working)
- `lldb`: Uses `initCommands: ["gdb-remote 127.0.0.1:${port}"]` (now fixed)
- Both use `request: "launch"` even for remote connections
- `lldb-server gdbserver` is LLDB's implementation of GDB Remote Serial Protocol

## Next Steps 🎯

### Phase 1: Test LLDB Fix (IMMEDIATE - NEXT TASK)
**Goal**: Verify the LLDB remote connection actually works

**Steps**:
1. Set VS Code setting: `"bluebazel.debug.debuggerType": "lldb"`
2. Debug a C++ target using "Bazel mode" (not direct launch)
3. Verify LLDB connects to `lldb-server gdbserver` process
4. Confirm debugging works (breakpoints, stepping, variables)

**Expected Behavior**:
- BlueBazel starts: `lldb-server gdbserver :${port} /path/to/program`
- LLDB connects via `gdb-remote 127.0.0.1:${port}`
- Remote debugging works properly

### Phase 2: Fix Debug Server Cleanup Bug (HIGH PRIORITY)

**Issue**: Debug servers (gdbserver/lldb-server) don't get properly killed after debugging sessions end, causing "Waiting on process (pid) to complete" warnings and orphaned processes.

**Root Cause**: `serverExec.terminate()` only sends SIGTERM, which debug servers may ignore.

#### 2.1 Implement Escalated Termination (Option 1)

**Add to**: `src/controllers/target-controllers/debug-controller.ts`

**New Method**:
```typescript
private async forceKillServer(serverExec: vscode.TaskExecution, port: number): Promise<void> {
    // Step 1: Gentle termination
    serverExec.terminate();

    // Step 2: Wait 2 seconds, then force-kill via port-based process killing
    setTimeout(async () => {
        try {
            // Use shell service to force-kill processes on the debug port
            const shellService = new ShellService(); // Get instance appropriately
            await shellService.execute(
                `pkill -9 -f "(gdb|lldb)-server.*:${port}"`,
                process.cwd(),
                {}
            );
            Console.info(`Force-killed debug server on port ${port}`);
        } catch (error) {
            Console.warn(`Failed to force-kill debug server on port ${port}: ${error}`);
        }
    }, 2000);
}
```

**Update Cleanup Code** (line ~213):
```typescript
// Replace: serverExec?.terminate();
// With:
if (serverExec) {
    await this.forceKillServer(serverExec, port);
}
```

### Phase 3: Smart Server Detection (POSTPONED)

**Rationale for Postponement**: While server reuse could provide 1-3 second performance improvements, it introduces significant complexity and risks:

**Critical Issues Identified**:
- **Build Invalidation**: Server might be running old binary version after code changes
- **Stale Process State**: Previous debug sessions may have corrupted memory/globals
- **Environment Drift**: Changed env vars, working directories, command line args
- **Resource Consumption**: Long-lived processes consuming system resources
- **Security Exposure**: Open debug ports as potential attack vectors

**Decision**: Wait for user complaints about debug startup time before implementing complex server reuse. The 1-3 second improvement may not be noticeable compared to build times.

**Future Implementation**: If users request this optimization, add build validation (timestamp checking) and smart cleanup to mitigate the risks above.

## Testing Strategy 🧪

### Test Case 1: LLDB Remote Connection
1. Set `"bluebazel.debug.debuggerType": "lldb"`
2. Debug C++ target in Bazel mode
3. Verify LLDB connects to lldb-server properly
4. Test breakpoints, stepping, variable inspection

### Test Case 2: Server Cleanup Fix
1. Start debug session (both gdb and lldb)
2. End debugging session
3. Verify no orphaned server processes remain (`ps aux | grep -E "(gdb|lldb)-server"`)
4. Check no "Waiting on process" warnings appear

### Test Case 3: Unix Platform Compatibility
1. Test escalated termination on Linux and macOS
2. Verify `pkill -9 -f` command works reliably on both platforms
3. Ensure proper cleanup across different shell environments

## File Locations 📁

**Files to Modify**:
- ✅ `src/languages/plugins/cpp-language-plugin.ts:297` (LLDB fix applied)
- ⏳ `src/services/network-utils.ts` (add detection function)
- ⏳ `package.json` (add settings)
- ⏳ `src/services/configuration-manager.ts` (add getters)
- ⏳ `src/controllers/target-controllers/debug-controller.ts` (modify flow)

**Key Methods**:
- `createLldbAttachConfig()` ✅ Fixed
- `debugInBazel()` ⏳ Needs server detection logic
- `createAttachConfig()` ✅ Already works for both debuggers

## Current Blockers ⚠️

**None** - Ready to proceed with Phase 1 testing

## Notes & Discoveries 📝

- **Protocol Insight**: Both `gdbserver` and `lldb-server gdbserver` speak GDB Remote Serial Protocol
- **LLDB Server**: `lldb-server gdbserver` is a single executable, not a wrapper around separate `gdbserver`
- **VS Code Debugging**: Extensions handle the actual debugging; BlueBazel just generates configurations
- **Existing Infrastructure**: `network-utils.ts` already has port detection via `checkPortAvailable()`

---

## Quick Start Tomorrow 🚀

**Priority Order**:
1. **Test LLDB fix**: Change debugger type to `lldb` and verify remote debugging works
2. **Implement server cleanup fix**: Add escalated termination to prevent orphaned processes
3. **Test cleanup**: Verify no more "Waiting on process" warnings

**Current branch**: `codelldb-support`
**Key changes made**:
- ✅ `src/languages/plugins/cpp-language-plugin.ts:297` - Added `initCommands` for LLDB remote connection

**Next changes needed**:
- ⏳ Add `forceKillServer()` method to `debug-controller.ts`
- ⏳ Update cleanup logic to use escalated termination