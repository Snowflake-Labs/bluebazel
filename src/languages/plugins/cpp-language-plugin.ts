////////////////////////////////////////////////////////////////////////////////////
// MIT License
//
// Copyright (c) 2021-2024 NVIDIA Corporation
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
////////////////////////////////////////////////////////////////////////////////////
import { BazelTarget } from '../../models/bazel-target';
import { BazelService } from '../../services/bazel-service';
import { ConfigurationManager } from '../../services/configuration-manager';
import { EnvVarsUtils } from '../../services/env-vars-utils';
import { WorkspaceService } from '../../services/workspace-service';
import { LanguagePlugin } from '../language-plugin';
import * as path from 'path';
import * as vscode from 'vscode';


export class CppLanguagePlugin implements LanguagePlugin {
    public readonly supportedLanguages: string[];

    constructor(private readonly context: vscode.ExtensionContext,
        private readonly bazelService: BazelService,
        private readonly setupEnvVars: string[],
        private readonly configurationManager: ConfigurationManager
    ) {
        this.supportedLanguages = ['cpp', 'c'];
    }

    private getBinaryPath(target: BazelTarget): string {
        // Use Bazel workspace root for binary path, since that's where bazel-bin is located
        const bazelWorkspaceFolder = WorkspaceService.getInstance().getBazelWorkspaceFolder();
        return path.join(bazelWorkspaceFolder.uri.fsPath, target.buildPath);
    }

    public getDebugRunUnderCommand(port: number): string {
        const debuggerType = this.configurationManager.getDebuggerType();

        if (debuggerType === 'lldb') {
            // Find CodeLLDB extension directory dynamically
            const codelldbPath = this.getCodeLLDBPath();
            if (codelldbPath) {
                return `${codelldbPath}/lldb/bin/lldb-server gdbserver :${port}`;
            } else {
                // Fallback to system lldb-server if CodeLLDB not found
                return `lldb-server gdbserver :${port}`;
            }
        } else {
            return `gdbserver :${port}`;
        }
    }

    private getCodeLLDBPath(): string | null {
        try {
            const fs = require('fs');
            const path = require('path');
            const os = require('os');

            const extensionsDir = path.join(os.homedir(), '.vscode-server', 'extensions');

            if (!fs.existsSync(extensionsDir)) {
                return null;
            }

            const extensions = fs.readdirSync(extensionsDir);
            const codelldbDir = extensions.find((dir: string) => dir.startsWith('vadimcn.vscode-lldb-'));

            if (codelldbDir) {
                const fullPath = path.join(extensionsDir, codelldbDir);
                const lldbServerPath = path.join(fullPath, 'lldb', 'bin', 'lldb-server');

                // Verify the lldb-server binary exists
                if (fs.existsSync(lldbServerPath)) {
                    return fullPath;
                }
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    public getDebugEnvVars(_target: BazelTarget): string[] {
        return [];
    }

    public async createDebugRunUnderLaunchConfig(target: BazelTarget,
        _cancellationToken?: vscode.CancellationToken): Promise<vscode.DebugConfiguration> {
        const debuggerType = this.configurationManager.getDebuggerType();

        if (debuggerType === 'lldb') {
            return this.createLldbRunUnderLaunchConfig(target);
        } else {
            return this.createCppdbgRunUnderLaunchConfig(target);
        }
    }

    private async createCppdbgRunUnderLaunchConfig(target: BazelTarget): Promise<vscode.DebugConfiguration> {
        const bazelTarget = BazelService.formatBazelTargetFromPath(target.buildPath);
        const bazelArgs = target.getBazelArgs().toString();
        const configArgs = target.getConfigArgs().toString();
        const workingDirectory = '${workspaceFolder}';
        const targetPath = target.buildPath;//await this.bazelService.getBazelTargetBuildPath(target, cancellationToken);
        const programPath = path.join(workingDirectory, targetPath);

        /* The environment key for type 'cppdbg' is different than
         * other launch configs because it expects an array of
         * objects that have a name key and value key in each object.
         * For example:
         * "environment": [
         *      {
         *          "name": "MY_ENV_VAR",
         *          "value": "my_value"
         *      },
         *      {
         *          "name": "ANOTHER_VAR",
         *          "value": "another_value"
         *      }
         */
        const envVars = EnvVarsUtils.listToArrayOfObjects(target.getEnvVars().toStringArray());
        const runArgs = target.getRunArgs().toString();

        const config = {
            name: `${bazelTarget} (Run Under)`,
            type: 'cppdbg',
            request: 'launch',
            program: '/bin/bash',
            args: ['-c', `./.vscode/bazel_debug.sh ${target.action} --run_under=gdb ${bazelArgs} ${configArgs} ${bazelTarget} ${runArgs}`],
            stopAtEntry: false,
            cwd: workingDirectory,
            sourceFileMap: { '/proc/self/cwd': workingDirectory },
            environment: [ ...EnvVarsUtils.listToArrayOfObjects(this.setupEnvVars), ...envVars ],
            externalConsole: false,
            targetArchitecture: 'x64',
            customLaunchSetupCommands: [
                { description: '', text: `-file-exec-and-symbols ${programPath}`, ignoreFailures: false }
            ],
            setupCommands: [{ description: 'Enable pretty-printing for gdb', text: '-enable-pretty-printing', ignoreFailures: true }],
            logging: { programOutput: true },
            internalConsoleOptions: 'openOnSessionStart'
        } as vscode.DebugConfiguration;
        return config;
    }

    private async createLldbRunUnderLaunchConfig(target: BazelTarget): Promise<vscode.DebugConfiguration> {
        const bazelTarget = BazelService.formatBazelTargetFromPath(target.buildPath);
        const bazelArgs = target.getBazelArgs().toString();
        const configArgs = target.getConfigArgs().toString();
        const workingDirectory = '${workspaceFolder}';
        const runArgs = target.getRunArgs().toString();

        return {
            name: `${bazelTarget} (LLDB Run Under)`,
            type: 'lldb',
            request: 'launch',
            program: '/bin/bash',
            args: ['-c', `./.vscode/bazel_debug.sh ${target.action} --run_under="${this.getDebugRunUnderCommand(0).replace(':0', '')}" ${bazelArgs} ${configArgs} ${bazelTarget} ${runArgs}`],
            cwd: workingDirectory,
            sourceMap: {
                '/proc/self/cwd': workingDirectory,
                '.': workingDirectory
            },
            env: EnvVarsUtils.listToObject([...this.setupEnvVars, ...target.getEnvVars().toStringArray()]),
            console: 'integratedTerminal'
        };
    }

    public async createDebugDirectLaunchConfig(target: BazelTarget, _cancellationToken?: vscode.CancellationToken): Promise<vscode.DebugConfiguration> {
        const debuggerType = this.configurationManager.getDebuggerType();

        if (debuggerType === 'lldb') {
            return this.createLldbDirectLaunchConfig(target);
        } else {
            return this.createCppdbgDirectLaunchConfig(target);
        }
    }

    private async createCppdbgDirectLaunchConfig(target: BazelTarget): Promise<vscode.DebugConfiguration> {
        const workingDirectory = '${workspaceFolder}';
        const programPath = this.getBinaryPath(target);

        /* The environment key for type 'cppdbg' is different than
         * other launch configs because it expects an array of
         * objects that have a name key and value key in each object.
         * For example:
         * "environment": [
         *      {
         *          "name": "MY_ENV_VAR",
         *          "value": "my_value"
         *      },
         *      {
         *          "name": "ANOTHER_VAR",
         *          "value": "another_value"
         *      }
         */
        const envVars = EnvVarsUtils.listToArrayOfObjects(target.getEnvVars().toStringArray());
        const args = target.getRunArgs().toString();

        return {
            name: `${programPath} (Direct)`,
            type: 'cppdbg',
            request: 'launch',
            program: programPath,
            stopAtEntry: false,
            cwd: workingDirectory,
            environment: [...EnvVarsUtils.listToArrayOfObjects(this.setupEnvVars), ...envVars],
            externalConsole: false,
            MIMode: 'gdb',
            setupCommands: [{ description: 'Enable pretty-printing for gdb', text: '-enable-pretty-printing', ignoreFailures: true }],
            args: args.length > 0 ? args.split(' ') : []
        };
    }

    public async createDebugAttachConfig(target: BazelTarget,
        port: number,
        _cancellationToken?: vscode.CancellationToken): Promise<vscode.DebugConfiguration> {
        const debuggerType = this.configurationManager.getDebuggerType();

        if (debuggerType === 'lldb') {
            return this.createLldbAttachConfig(target, port);
        } else {
            return this.createCppdbgAttachConfig(target, port);
        }
    }

    private async createCppdbgAttachConfig(target: BazelTarget, port: number): Promise<vscode.DebugConfiguration> {
        const bazelTarget = BazelService.formatBazelTargetFromPath(target.buildPath);
        const workingDirectory = '${workspaceFolder}';
        const programPath = this.getBinaryPath(target);

        const envVars = EnvVarsUtils.listToArrayOfObjects(target.getEnvVars().toStringArray());

        const runArgs = target.getRunArgs().toString();

        const config = {
            name: `${bazelTarget} (Attach)`,
            type: 'cppdbg',
            // Oddly enough, gdb requires launch when attaching because
            // attach is reserved for process id...
            request: 'launch',
            program: programPath,
            miDebuggerServerAddress: `127.0.0.1:${port}`,
            miDebuggerPath: this.configurationManager.getDebugGdbPath(),
            MIMode: 'gdb',
            stopAtEntry: false,
            cwd: workingDirectory,
            sourceFileMap: {
                '/proc/self/cwd': workingDirectory,
                '.': workingDirectory
            },
            environment: [...EnvVarsUtils.listToArrayOfObjects(this.setupEnvVars), ...envVars],
            externalConsole: false,
            targetArchitecture: 'x64',
            customLaunchSetupCommands: [
                {
                    description: 'Load symbols',
                    text: `-file-exec-and-symbols ${programPath}`,
                    ignoreFailures: false
                },
                {
                    description: 'Load all symbols',
                    text: 'sharedlibrary',
                    ignoreFailures: true
                },
                {
                    description: 'Do not detach from child on fork',
                    text: 'set detach-on-fork off',
                    ignoreFailures: true
                },
                {
                    description: 'Set follow-fork-mode to child',
                    text: 'set follow-fork-mode child',
                    ignoreFailures: true
                },
                {
                    description: 'Set follow-exec-mode',
                    text: 'set follow-exec-mode new',
                    ignoreFailures: true
                },
                {
                    description: 'Ignore child thread exit signals',
                    text: 'handle SIGCHLD nostop noprint',
                    ignoreFailures: true
                }
            ],
            setupCommands: [
                {
                    description: 'Enable pretty-printing for gdb',
                    text: '-enable-pretty-printing',
                    ignoreFailures: true
                },
                {
                    description: 'Set program arguments',
                    text: `set args ${runArgs}`,
                    ignoreFailures: true
                }
            ],
            logging: {
                programOutput: true,
            },
            internalConsoleOptions: 'openOnSessionStart',
            useExtendedRemote: true,
        };
        return config;
    }

    private async createLldbAttachConfig(target: BazelTarget, port: number): Promise<vscode.DebugConfiguration> {
        const bazelTarget = BazelService.formatBazelTargetFromPath(target.buildPath);
        const workingDirectory = '${workspaceFolder}';
        const programPath = this.getBinaryPath(target);
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

    /**
     * Regex to match test functions in C/C++.
     * Example matches:
     * TEST(TestSuite, TestName)
     * TEST_F(TestFixture, TestName)
     */
    public getCodeLensTestRegex(): RegExp {
        return /\b(?:TEST|TEST_F|TYPED_TEST|TYPED_TEST_P)\s*\(\s*([a-zA-Z_]\w*)\s*,\s*([a-zA-Z_]\w*)\s*\)/gm;
    }

    /**
     * Regex to match main function definitions in C/C++.
     * Example matches:
     * int main()
     * int main(int argc, char** argv)
     * int main(int argc, char* argv[])
     * void main()
     * void main(int argc, char** argv)
     * void main(int argc, char* argv[])
     * static int main(int argc, char* argv[])
     * static void main(int argc, char* argv[])
     */
    public getCodeLensRunRegex(): RegExp {
        return /\b(?:int|void)\s+(main)\s*\(\s*(?:int\s+\w+\s*,\s*char\s*\*\s*\w+\s*)?\s*\)/gm;
    }

}