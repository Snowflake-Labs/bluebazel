Currently bluebazel can only debug using the cppdbg launch type (Microsoft C++ extension). I'd like to add functionality to use the lldb launcher type (Code LLDB extension).

I need the following:
* allow users to choose which debugger to use (cppdbg vs lldb) via settings.
* the default debugger should be cppdbg
* modify the debugger launch configuration based on user chosen debugger
* read the CODELLDB manual at https://github.com/vadimcn/codelldb/blob/v1.11.5/MANUAL.md
* create a similar launch configuration for lldb when user has selected lldb
* This is a launch configuration I created manually for a bazel target and it works

```
{
    "name": "debug example_bin",
    "type": "lldb",
    "request": "launch",
    "program": "${workspaceFolder}/bazel-bin/example_bin/example_bin",
    "args": [],
    "cwd": "${workspaceFolder}/bazel-bin/example_bin/example_bin.runfiles/__main__",
    "preLaunchTask": "build //example_bin:example_bin",
    "sourceMap": {
        ".": "${workspaceFolder}"
    },
}
```