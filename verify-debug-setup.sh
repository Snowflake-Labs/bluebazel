#!/bin/bash

# BlueBazel Debug Testing Prerequisites Verification Script
# Checks for tools needed to test debug support based on preferred debugger

set -e

# Parse command line arguments
DEBUGGER_PREF="${1:-both}"

usage() {
    echo "Usage: $0 [gdb|lldb|both]"
    echo ""
    echo "Arguments:"
    echo "  gdb   - Check only GDB/cppdbg toolchain"
    echo "  lldb  - Check only LLDB/CodeLLDB toolchain"
    echo "  both  - Check both toolchains (default)"
    echo ""
    echo "Examples:"
    echo "  $0 lldb    # Only check LLDB tools"
    echo "  $0 gdb     # Only check GDB tools"
    echo "  $0         # Check both (default)"
}

if [[ "$1" == "-h" || "$1" == "--help" ]]; then
    usage
    exit 0
fi

if [[ "$DEBUGGER_PREF" != "gdb" && "$DEBUGGER_PREF" != "lldb" && "$DEBUGGER_PREF" != "both" ]]; then
    echo "Error: Invalid debugger preference '$DEBUGGER_PREF'"
    echo ""
    usage
    exit 1
fi

echo "🔍 BlueBazel Debug Testing Prerequisites Verification"
echo "Checking for: $DEBUGGER_PREF debugger toolchain(s)"
echo "=================================================="
echo ""
echo "💡 This script provides installation commands for APT, DNF, and Nix package managers."
echo "   For temporary Nix installations, use: nix-shell -p <package>"
echo "   Search packages at: https://search.nixos.org/packages?channel=25.05"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
MISSING_COUNT=0
TOTAL_CHECKS=0

check_command() {
    local cmd=$1
    local description=$2
    local install_hint=$3
    local nix_pkg=$4

    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    if command -v "$cmd" >/dev/null 2>&1; then
        echo -e "✅ ${GREEN}$description${NC} - $(command -v $cmd)"
        if [[ "$cmd" == "gdb" || "$cmd" == "lldb" ]]; then
            echo "   Version: $($cmd --version | head -n1)"
        fi
    else
        echo -e "❌ ${RED}$description${NC} - Missing!"
        if [[ -n "$install_hint" ]]; then
            echo -e "   ${YELLOW}Install:${NC} $install_hint"
        fi
        if [[ -n "$nix_pkg" ]]; then
            echo -e "   ${YELLOW}Nix:${NC} nix-env -iA nixpkgs.$nix_pkg"
        fi
        MISSING_COUNT=$((MISSING_COUNT + 1))
    fi
}

check_vscode_extension() {
    local ext_id=$1
    local description=$2

    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    if command -v code >/dev/null 2>&1; then
        if code --list-extensions 2>/dev/null | grep -q "$ext_id"; then
            echo -e "✅ ${GREEN}$description${NC}"
        else
            echo -e "❌ ${RED}$description${NC} - Missing!"
            echo -e "   ${YELLOW}Install:${NC} code --install-extension $ext_id"
            MISSING_COUNT=$((MISSING_COUNT + 1))
        fi
    else
        echo -e "❌ ${RED}VS Code${NC} - Not found! Cannot check extensions."
        MISSING_COUNT=$((MISSING_COUNT + 1))
    fi
}

test_debug_server() {
    local cmd=$1
    local description=$2

    echo -n "🧪 Testing $description startup... "

    # Try to start server in background and kill it quickly
    if timeout 2s bash -c "$cmd :9999 /bin/true >/dev/null 2>&1 &" 2>/dev/null; then
        echo -e "${GREEN}OK${NC}"
        # Clean up any remaining processes
        pkill -f "$cmd.*:9999" 2>/dev/null || true
    else
        echo -e "${YELLOW}Warning: Could not test server startup${NC}"
    fi
}

echo -e "\n📦 Build Tools:"
check_command "bazel" "Bazel Build Tool" "sudo apt install bazel (Ubuntu) or sudo dnf install bazel (RHEL/Fedora)" "bazel"
check_command "gcc" "GCC Compiler" "sudo apt install build-essential (Ubuntu) or sudo dnf install gcc-c++ (RHEL/Fedora)" "gcc"
check_command "clang" "Clang Compiler" "sudo apt install clang (Ubuntu) or sudo dnf install clang (RHEL/Fedora)" "clang"

echo -e "\n🐛 Debug Tools:"

# Check GDB tools if requested
if [[ "$DEBUGGER_PREF" == "gdb" || "$DEBUGGER_PREF" == "both" ]]; then
    echo -e "  ${YELLOW}GDB Toolchain:${NC}"
    check_command "gdb" "GNU Debugger (GDB)" "sudo apt install gdb (Ubuntu) or sudo dnf install gdb (RHEL/Fedora)" "gdb"
    check_command "gdbserver" "GDB Server" "sudo apt install gdbserver (Ubuntu) or sudo dnf install gdb-gdbserver (RHEL/Fedora)" "gdb"
fi

# Check LLDB tools if requested
if [[ "$DEBUGGER_PREF" == "lldb" || "$DEBUGGER_PREF" == "both" ]]; then
    echo -e "  ${YELLOW}LLDB Toolchain:${NC}"
    check_command "lldb" "LLVM Debugger (LLDB)" "sudo apt install lldb (Ubuntu) or sudo dnf install lldb (RHEL/Fedora)" "lldb"
    check_command "lldb-server" "LLDB Server" "sudo apt install lldb-server (Ubuntu) or sudo dnf install lldb-server (RHEL/Fedora)" "lldb"
fi

echo -e "\n🔧 System Tools:"
check_command "pkill" "Process Kill Utility" "Should be pre-installed on most Linux systems" "procps"
check_command "ps" "Process Status" "Should be pre-installed on most Linux systems" "procps"
check_command "grep" "Text Search" "Should be pre-installed on most Linux systems" "gnugrep"

echo -e "\n🔌 VS Code Extensions:"

# Check GDB extension if requested
if [[ "$DEBUGGER_PREF" == "gdb" || "$DEBUGGER_PREF" == "both" ]]; then
    check_vscode_extension "ms-vscode.cpptools" "Microsoft C++ Extension (for cppdbg)"
fi

# Check LLDB extension if requested
if [[ "$DEBUGGER_PREF" == "lldb" || "$DEBUGGER_PREF" == "both" ]]; then
    check_vscode_extension "vadimcn.vscode-lldb" "CodeLLDB Extension (for lldb)"
fi

echo -e "\n🧪 Debug Server Functionality:"

# Test GDB server if requested and available
if [[ "$DEBUGGER_PREF" == "gdb" || "$DEBUGGER_PREF" == "both" ]] && command -v gdbserver >/dev/null 2>&1; then
    test_debug_server "gdbserver" "gdbserver"
fi

# Test LLDB server if requested and available
if [[ "$DEBUGGER_PREF" == "lldb" || "$DEBUGGER_PREF" == "both" ]] && command -v lldb-server >/dev/null 2>&1; then
    test_debug_server "lldb-server gdbserver" "lldb-server"
fi

echo -e "\n📊 Summary:"
echo "=================================================="
PASSED=$((TOTAL_CHECKS - MISSING_COUNT))
echo -e "✅ ${GREEN}Passed: $PASSED/$TOTAL_CHECKS${NC}"

if [[ $MISSING_COUNT -gt 0 ]]; then
    echo -e "❌ ${RED}Missing: $MISSING_COUNT/$TOTAL_CHECKS${NC}"
    echo ""
    echo -e "${YELLOW}⚠️  Some components are missing. Install the missing tools before testing.${NC}"
    echo ""
    echo -e "${YELLOW}Tip:${NC} For quick testing with Nix, you can use temporary environments:"
    echo "     nix-shell -p bazel gcc gdb lldb   # Adjust packages as needed"
    exit 1
else
    echo -e "🎉 ${GREEN}All prerequisites met! Ready for BlueBazel debug testing.${NC}"
    echo ""
    echo -e "${GREEN}Next steps for $DEBUGGER_PREF debugger testing:${NC}"

    if [[ "$DEBUGGER_PREF" == "gdb" ]]; then
        echo "1. Set debugger type: Open VS Code settings and set 'bluebazel.debug.debuggerType' to 'cppdbg'"
        echo "2. Test GDB remote connection with a C++ target"
        echo "3. Test debug server cleanup fixes (gdbserver process termination)"
    elif [[ "$DEBUGGER_PREF" == "lldb" ]]; then
        echo "1. Set debugger type: Open VS Code settings and set 'bluebazel.debug.debuggerType' to 'lldb'"
        echo "2. Test LLDB remote connection with a C++ target"
        echo "3. Test debug server cleanup fixes (lldb-server process termination)"
    else
        echo "1. Test both debugger types:"
        echo "   - Set 'bluebazel.debug.debuggerType' to 'cppdbg' and test GDB"
        echo "   - Set 'bluebazel.debug.debuggerType' to 'lldb' and test LLDB"
        echo "2. Test debug server cleanup fixes for both debugger types"
    fi
fi

echo ""
echo "For more details, see: CODELLDB_DEBUG_IMPROVEMENTS_PLAN.md"