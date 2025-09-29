# Implementation Plan: CodeLLDB Support for BlueBazel

Based on my analysis of the codebase and CodeLLDB documentation, here's a step-by-step implementation plan:

## Overview
Currently BlueBazel only supports the Microsoft C++ extension (`cppdbg` debugger). We need to add support for the CodeLLDB extension (`lldb` debugger) while maintaining backward compatibility.

## Key Files to Modify

1. **package.json** - Add new settings
2. **src/services/configuration-manager.ts** - Add debugger selection methods
3. **src/languages/plugins/cpp-language-plugin.ts** - Add LLDB configuration creation
4. **src/controllers/target-controllers/debug-controller.ts** - Update for debugger selection (minimal changes needed)

## Implementation Steps

### 1. Add Configuration Settings (package.json)
Add new setting to allow users to choose debugger:

```json
"bluebazel.debug.debuggerType": {
    "type": "string",
    "enum": ["cppdbg", "lldb"],
    "default": "cppdbg",
    "description": "Choose which debugger to use for C++ debugging. 'cppdbg' uses Microsoft C++ extension, 'lldb' uses CodeLLDB extension."
}
```

### 2. Update ConfigurationManager
**File: src/services/configuration-manager.ts:295**

Add method to get debugger type:
```typescript
public getDebuggerType(): string {
    const config = this.getConfig();
    const res = config.get<string>('debug.debuggerType');
    if (res === undefined || res === '') {
        return 'cppdbg';
    }
    return res;
}
```

### 3. Modify CppLanguagePlugin
**File: src/languages/plugins/cpp-language-plugin.ts**

#### 3a. Update constructor to inject ConfigurationManager
- Add configurationManager parameter (already exists)

#### 3b. Modify createDebugAttachConfig method (line 137)
Split logic based on debugger type:
```typescript
public async createDebugAttachConfig(target: BazelTarget, port: number, _cancellationToken?: vscode.CancellationToken): Promise<vscode.DebugConfiguration> {
    const debuggerType = this.configurationManager.getDebuggerType();

    if (debuggerType === 'lldb') {
        return this.createLldbAttachConfig(target, port);
    } else {
        return this.createCppdbgAttachConfig(target, port);
    }
}
```

#### 3c. Modify createDebugDirectLaunchConfig method (line 100)
Split logic based on debugger type:
```typescript
public async createDebugDirectLaunchConfig(target: BazelTarget, _cancellationToken?: vscode.CancellationToken): Promise<vscode.DebugConfiguration> {
    const debuggerType = this.configurationManager.getDebuggerType();

    if (debuggerType === 'lldb') {
        return this.createLldbDirectLaunchConfig(target);
    } else {
        return this.createCppdbgDirectLaunchConfig(target);
    }
}
```

#### 3d. Extract existing cppdbg methods
- Rename existing `createDebugAttachConfig` → `createCppdbgAttachConfig`
- Rename existing `createDebugDirectLaunchConfig` → `createCppdbgDirectLaunchConfig`

#### 3e. Create new LLDB methods
Based on plan.md example and CodeLLDB docs:

```typescript
private async createLldbAttachConfig(target: BazelTarget, port: number): Promise<vscode.DebugConfiguration> {
    const bazelTarget = BazelService.formatBazelTargetFromPath(target.buildPath);
    const workingDirectory = '${workspaceFolder}';
    const targetPath = target.buildPath;
    const programPath = path.join(workingDirectory, targetPath);
    const runArgs = target.getRunArgs().toString();

    return {
        name: `${bazelTarget} (LLDB Attach)`,
        type: 'lldb',
        request: 'launch',
        program: programPath,
        args: runArgs.length > 0 ? runArgs.split(' ') : [],
        cwd: workingDirectory,
        sourceMap: {
            '.': workingDirectory
        },
        env: EnvVarsUtils.listToObject([...this.setupEnvVars, ...target.getEnvVars().toStringArray()]),
        initCommands: [
            `gdb-remote 127.0.0.1:${port}`
        ]
    };
}

private async createLldbDirectLaunchConfig(target: BazelTarget): Promise<vscode.DebugConfiguration> {
    const workingDirectory = '${workspaceFolder}';
    const targetPath = target.buildPath;
    const programPath = path.join(workingDirectory, targetPath);
    const runArgs = target.getRunArgs().toString();

    // Based on plan.md example
    return {
        name: `debug ${path.basename(targetPath)}`,
        type: 'lldb',
        request: 'launch',
        program: programPath,
        args: runArgs.length > 0 ? runArgs.split(' ') : [],
        cwd: `${workingDirectory}/${path.dirname(targetPath)}.runfiles/__main__`,
        sourceMap: {
            '.': workingDirectory
        },
        env: EnvVarsUtils.listToObject([...this.setupEnvVars, ...target.getEnvVars().toStringArray()])
    };
}
```

### 4. Update Debug Server Command Method
**File: src/languages/plugins/cpp-language-plugin.ts:44**

Modify `getDebugRunUnderCommand` to support LLDB:
```typescript
public getDebugRunUnderCommand(port: number): string {
    const debuggerType = this.configurationManager.getDebuggerType();

    if (debuggerType === 'lldb') {
        return `lldb-server gdbserver :${port}`;
    } else {
        return `gdbserver :${port}`;
    }
}
```

### 5. Add Pre-launch Task Support (Optional Enhancement)
Based on plan.md example, we could add pre-launch task support by modifying the LLDB direct launch config:

```typescript
preLaunchTask: `build ${bazelTarget}`,
```

This would require creating a corresponding task definition, but can be deferred to a future iteration.

## Implementation Order

1. **Add settings** - Update package.json with new debugger type setting
2. **Update ConfigurationManager** - Add getter for debugger type
3. **Refactor CppLanguagePlugin** - Extract existing methods and add debugger selection logic
4. **Add LLDB methods** - Implement LLDB-specific configuration creation
5. **Update debug server command** - Support lldb-server
6. **Test both configurations** - Verify both debuggers work correctly

## Testing Strategy

1. **Test cppdbg (existing)** - Ensure no regression in Microsoft C++ extension support
2. **Test lldb (new)** - Verify CodeLLDB extension works with new configurations
3. **Test setting changes** - Ensure switching debugger types works correctly
4. **Test both modes** - Direct launch and attach modes for both debuggers

## Backward Compatibility

- Default debugger remains `cppdbg` (Microsoft C++ extension)
- Existing users see no change unless they explicitly switch to LLDB
- All existing functionality preserved

This implementation provides a clean separation between the two debugger types while reusing the existing debugging infrastructure in BlueBazel.

## Current Plan.md Requirements Met

✅ Allow users to choose which debugger to use (cppdbg vs lldb) via settings
✅ Default debugger should be cppdbg
✅ Modify debugger launch configuration based on user chosen debugger
✅ Read CodeLLDB manual documentation
✅ Create similar launch configuration for lldb when user has selected lldb
✅ Use the working launch configuration example from plan.md as reference