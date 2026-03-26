package tinygofrontend

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestSourceSelectionOmitsLegacyDerivedGroups(t *testing.T) {
	sourceSelectionType := reflect.TypeOf(SourceSelection{})
	for _, field := range []string{
		"TargetAssets",
		"RuntimeSupport",
		"Program",
		"Imported",
		"Stdlib",
	} {
		if _, ok := sourceSelectionType.FieldByName(field); ok {
			t.Fatalf("expected SourceSelection to omit legacy field %q", field)
		}
	}
}

func TestBuildProducesCompileGroups(t *testing.T) {
	result, err := Build(Input{
		OptimizeFlag: "-Oz",
		EntryFile:    "/workspace/main.go",
		Toolchain: Toolchain{
			Target:             "wasm",
			ArtifactOutputPath: "/working/out.wasm",
		},
		SourceSelection: SourceSelection{
			AllCompile: []string{
				"/working/.tinygo-root/src/fmt/print.go",
				"/workspace/lib/helper.go",
				"/workspace/main.go",
			},
		},
		CompileUnits: []IntermediateCompileUnit{
			{Kind: "program", PackageDir: "/workspace", Files: []string{"/workspace/main.go"}},
			{Kind: "imported", PackageDir: "/workspace/lib", Files: []string{"/workspace/lib/helper.go"}},
			{Kind: "stdlib", PackageDir: "/working/.tinygo-root/src/fmt", Files: []string{"/working/.tinygo-root/src/fmt/print.go"}},
		},
	})
	if err != nil {
		t.Fatalf("Build returned error: %v", err)
	}

	if !result.OK {
		t.Fatalf("unexpected result: %#v", result)
	}
	if len(result.GeneratedFiles) != 7 {
		t.Fatalf("unexpected generated files: %#v", result.GeneratedFiles)
	}
	if !reflect.DeepEqual([]string{result.GeneratedFiles[0].Path, result.GeneratedFiles[1].Path, result.GeneratedFiles[2].Path, result.GeneratedFiles[3].Path, result.GeneratedFiles[4].Path, result.GeneratedFiles[5].Path, result.GeneratedFiles[6].Path}, []string{
		"/working/tinygo-bootstrap.c",
		"/working/tinygo-compile-unit.json",
		"/working/tinygo-intermediate.json",
		"/working/tinygo-lowering-input.json",
		"/working/tinygo-work-items.json",
		"/working/tinygo-lowering-plan.json",
		"/working/tinygo-backend-input.json",
	}) {
		t.Fatalf("unexpected generated files: %#v", result.GeneratedFiles)
	}
	if !strings.Contains(result.GeneratedFiles[1].Contents, "\"entryFile\":\"/workspace/main.go\"") ||
		!strings.Contains(result.GeneratedFiles[1].Contents, "\"toolchain\":{\"target\":\"wasm\",\"artifactOutputPath\":\"/working/out.wasm\"}") ||
		!strings.Contains(result.GeneratedFiles[1].Contents, "\"sourceSelection\":{\"allCompile\":[\"/working/.tinygo-root/src/fmt/print.go\",\"/workspace/lib/helper.go\",\"/workspace/main.go\"]}") ||
		!strings.Contains(result.GeneratedFiles[1].Contents, "\"allCompile\":[\"/working/.tinygo-root/src/fmt/print.go\",\"/workspace/lib/helper.go\",\"/workspace/main.go\"]") ||
		!strings.Contains(result.GeneratedFiles[1].Contents, "\"materializedFiles\":[\"/working/.tinygo-root/src/device/arm/arm.go\"") {
		t.Fatalf("unexpected compile unit manifest: %q", result.GeneratedFiles[1].Contents)
	}
	if strings.Contains(result.GeneratedFiles[1].Contents, "\"packageLayout\":") {
		t.Fatalf("expected compile unit manifest to omit package layout: %q", result.GeneratedFiles[1].Contents)
	}
	if strings.Contains(result.GeneratedFiles[1].Contents, "\"checksum\":") {
		t.Fatalf("expected compile unit manifest to omit checksum: %q", result.GeneratedFiles[1].Contents)
	}
	if strings.Contains(result.GeneratedFiles[1].Contents, "\"mode\":") {
		t.Fatalf("expected compile unit manifest to omit mode: %q", result.GeneratedFiles[1].Contents)
	}
	if strings.Contains(result.GeneratedFiles[1].Contents, "\"program\":") {
		t.Fatalf("expected compile unit manifest to omit program group: %q", result.GeneratedFiles[1].Contents)
	}
	if strings.Contains(result.GeneratedFiles[1].Contents, "\"targetAssets\":") {
		t.Fatalf("expected compile unit manifest to omit target assets: %q", result.GeneratedFiles[1].Contents)
	}
	if strings.Contains(result.GeneratedFiles[1].Contents, "\"runtimeSupport\":") {
		t.Fatalf("expected compile unit manifest to omit runtime support: %q", result.GeneratedFiles[1].Contents)
	}
	if strings.Contains(result.GeneratedFiles[1].Contents, "\"imported\":") {
		t.Fatalf("expected compile unit manifest to omit imported group: %q", result.GeneratedFiles[1].Contents)
	}
	if strings.Contains(result.GeneratedFiles[1].Contents, "\"stdlib\":") {
		t.Fatalf("expected compile unit manifest to omit stdlib group: %q", result.GeneratedFiles[1].Contents)
	}
	for _, unexpected := range []string{
		"/working/tinygo-bootstrap.json",
		"/working/tinygo-frontend-input.json",
	} {
		if strings.Contains(result.GeneratedFiles[1].Contents, unexpected) {
			t.Fatalf("expected compile unit manifest to omit planner handoff file %q: %q", unexpected, result.GeneratedFiles[1].Contents)
		}
		if strings.Contains(result.GeneratedFiles[0].Contents, unexpected) {
			t.Fatalf("expected bootstrap source to omit planner handoff file %q: %q", unexpected, result.GeneratedFiles[0].Contents)
		}
	}
	for _, unexpected := range []string{
		"\"packageFileCount\":",
		"\"importedPackageFileCount\":",
		"\"stdlibPackageFileCount\":",
		"\"allFileCount\":",
		"\"targetAssetCount\":",
		"\"runtimeSupportFileCount\":",
		"\"programFileCount\":",
		"\"materializedFileCount\":",
	} {
		if strings.Contains(result.GeneratedFiles[1].Contents, unexpected) {
			t.Fatalf("expected compile unit manifest to omit %s: %q", unexpected, result.GeneratedFiles[1].Contents)
		}
	}
	var compileUnitManifest map[string]any
	if err := json.Unmarshal([]byte(result.GeneratedFiles[1].Contents), &compileUnitManifest); err != nil {
		t.Fatalf("json.Unmarshal(compile-unit): %v", err)
	}
	for _, key := range []string{
		"target",
		"llvmTarget",
		"linker",
		"modulePath",
		"imports",
		"buildTags",
		"translationUnitPath",
		"objectOutputPath",
		"artifactOutputPath",
		"packageFiles",
		"importedPackageFiles",
		"stdlibPackageFiles",
		"allFiles",
		"allCompileFiles",
		"targetAssetFiles",
		"runtimeSupportFiles",
		"programFiles",
		"packageFileCount",
		"importedPackageFileCount",
		"stdlibPackageFileCount",
		"allFileCount",
		"targetAssetCount",
		"runtimeSupportFileCount",
		"programFileCount",
		"materializedFileCount",
	} {
		if _, ok := compileUnitManifest[key]; ok {
			t.Fatalf("expected compile unit manifest to omit top-level %q: %#v", key, compileUnitManifest)
		}
	}
	if !strings.Contains(result.GeneratedFiles[0].Contents, "\"/workspace/lib/helper.go\"") ||
		!strings.Contains(result.GeneratedFiles[0].Contents, "\\\"materializedFiles\\\":[\\\"/working/.tinygo-root/src/device/arm/arm.go\\\"") {
		t.Fatalf("unexpected generated bootstrap source: %q", result.GeneratedFiles[0].Contents)
	}
	if strings.Contains(result.GeneratedFiles[0].Contents, "module: ") {
		t.Fatalf("expected bootstrap source to omit module comment: %q", result.GeneratedFiles[0].Contents)
	}
	if strings.Contains(result.GeneratedFiles[0].Contents, "unsigned int tinygo_dispatch_materialized_file_count(void)") {
		t.Fatalf("expected generated bootstrap source to omit materialized-file dispatch count export: %q", result.GeneratedFiles[0].Contents)
	}
	var intermediateManifest IntermediateManifest
	if err := json.Unmarshal([]byte(result.GeneratedFiles[2].Contents), &intermediateManifest); err != nil {
		t.Fatalf("json.Unmarshal(intermediate): %v", err)
	}
	if intermediateManifest.EntryFile != "/workspace/main.go" {
		t.Fatalf("unexpected intermediate manifest: %#v", intermediateManifest)
	}
	if !strings.Contains(result.GeneratedFiles[2].Contents, "\"sourceSelection\":{\"targetAssets\":[\"/working/.tinygo-root/targets/wasm-undefined.txt\",\"/working/.tinygo-root/targets/wasm.json\"],\"runtimeSupport\":[\"/working/.tinygo-root/src/device/arm/arm.go\",\"/working/.tinygo-root/src/runtime/asm_tinygowasm.S\",\"/working/.tinygo-root/src/runtime/gc_boehm.c\",\"/working/.tinygo-root/src/runtime/internal/sys/zversion.go\"],\"program\":[\"/workspace/main.go\"],\"imported\":[\"/workspace/lib/helper.go\"],\"stdlib\":[\"/working/.tinygo-root/src/fmt/print.go\"],\"allCompile\":[\"/working/.tinygo-root/src/fmt/print.go\",\"/workspace/lib/helper.go\",\"/workspace/main.go\"]}") {
		t.Fatalf("unexpected intermediate manifest contents: %q", result.GeneratedFiles[2].Contents)
	}
	if !strings.Contains(result.GeneratedFiles[2].Contents, "\"toolchain\":{\"target\":\"wasm\",\"llvmTarget\":\"wasm32-unknown-wasi\",\"linker\":\"wasm-ld\",\"cflags\":[\"-mbulk-memory\",\"-mnontrapping-fptoint\",\"-mno-multivalue\",\"-mno-reference-types\",\"-msign-ext\"],\"ldflags\":[\"--stack-first\",\"--no-demangle\",\"--no-entry\",\"--export-all\"],\"translationUnitPath\":\"/working/tinygo-bootstrap.c\",\"objectOutputPath\":\"/working/tinygo-bootstrap.o\",\"artifactOutputPath\":\"/working/out.wasm\"}") {
		t.Fatalf("unexpected intermediate toolchain contents: %q", result.GeneratedFiles[2].Contents)
	}
	if !reflect.DeepEqual(intermediateManifest.CompileUnits, []IntermediateCompileUnit{
		{Kind: "program", PackageDir: "/workspace", Files: []string{"/workspace/main.go"}},
		{Kind: "imported", PackageDir: "/workspace/lib", Files: []string{"/workspace/lib/helper.go"}},
		{Kind: "stdlib", PackageDir: "/working/.tinygo-root/src/fmt", Files: []string{"/working/.tinygo-root/src/fmt/print.go"}},
	}) {
		t.Fatalf("unexpected intermediate compile units: %#v", intermediateManifest.CompileUnits)
	}
	var loweringManifest LoweringManifest
	if err := json.Unmarshal([]byte(result.GeneratedFiles[3].Contents), &loweringManifest); err != nil {
		t.Fatalf("json.Unmarshal(lowering): %v", err)
	}
	if loweringManifest.EntryFile != "/workspace/main.go" {
		t.Fatalf("unexpected lowering manifest: %#v", loweringManifest)
	}
	if !reflect.DeepEqual(loweringManifest.Support, LoweringSupport{
		TargetAssets:   []string{"/working/.tinygo-root/targets/wasm-undefined.txt", "/working/.tinygo-root/targets/wasm.json"},
		RuntimeSupport: []string{"/working/.tinygo-root/src/device/arm/arm.go", "/working/.tinygo-root/src/runtime/asm_tinygowasm.S", "/working/.tinygo-root/src/runtime/gc_boehm.c", "/working/.tinygo-root/src/runtime/internal/sys/zversion.go"},
	}) {
		t.Fatalf("unexpected lowering support: %#v", loweringManifest.Support)
	}
	if !reflect.DeepEqual(loweringManifest.CompileUnits, intermediateManifest.CompileUnits) {
		t.Fatalf("unexpected lowering compile units: %#v", loweringManifest.CompileUnits)
	}
	var workItemsManifest WorkItemsManifest
	if err := json.Unmarshal([]byte(result.GeneratedFiles[4].Contents), &workItemsManifest); err != nil {
		t.Fatalf("json.Unmarshal(work-items): %v", err)
	}
	if !reflect.DeepEqual(workItemsManifest.WorkItems, []WorkItem{
		{ID: "program-000", Kind: "program", PackageDir: "/workspace", Files: []string{"/workspace/main.go"}, BitcodeOutputPath: "/working/tinygo-work/program-000.bc"},
		{ID: "imported-000", Kind: "imported", PackageDir: "/workspace/lib", Files: []string{"/workspace/lib/helper.go"}, BitcodeOutputPath: "/working/tinygo-work/imported-000.bc"},
		{ID: "stdlib-000", Kind: "stdlib", PackageDir: "/working/.tinygo-root/src/fmt", Files: []string{"/working/.tinygo-root/src/fmt/print.go"}, BitcodeOutputPath: "/working/tinygo-work/stdlib-000.bc"},
	}) {
		t.Fatalf("unexpected work items: %#v", workItemsManifest.WorkItems)
	}
	var loweringPlanManifest LoweringPlanManifest
	if err := json.Unmarshal([]byte(result.GeneratedFiles[5].Contents), &loweringPlanManifest); err != nil {
		t.Fatalf("json.Unmarshal(lowering-plan): %v", err)
	}
	if !reflect.DeepEqual(loweringPlanManifest.CompileJobs, []LoweringCompileJob{
		{ID: "program-000", Kind: "program", PackageDir: "/workspace", Files: []string{"/workspace/main.go"}, BitcodeOutputPath: "/working/tinygo-work/program-000.bc", LLVMTarget: "wasm32-unknown-wasi", CFlags: []string{"-mbulk-memory", "-mnontrapping-fptoint", "-mno-multivalue", "-mno-reference-types", "-msign-ext"}, OptimizeFlag: "-Oz"},
		{ID: "imported-000", Kind: "imported", PackageDir: "/workspace/lib", Files: []string{"/workspace/lib/helper.go"}, BitcodeOutputPath: "/working/tinygo-work/imported-000.bc", LLVMTarget: "wasm32-unknown-wasi", CFlags: []string{"-mbulk-memory", "-mnontrapping-fptoint", "-mno-multivalue", "-mno-reference-types", "-msign-ext"}, OptimizeFlag: "-Oz"},
		{ID: "stdlib-000", Kind: "stdlib", PackageDir: "/working/.tinygo-root/src/fmt", Files: []string{"/working/.tinygo-root/src/fmt/print.go"}, BitcodeOutputPath: "/working/tinygo-work/stdlib-000.bc", LLVMTarget: "wasm32-unknown-wasi", CFlags: []string{"-mbulk-memory", "-mnontrapping-fptoint", "-mno-multivalue", "-mno-reference-types", "-msign-ext"}, OptimizeFlag: "-Oz"},
	}) {
		t.Fatalf("unexpected lowering compile jobs: %#v", loweringPlanManifest.CompileJobs)
	}
	if !reflect.DeepEqual(loweringPlanManifest.LinkJob, LoweringLinkJob{
		Linker:             "wasm-ld",
		LDFlags:            []string{"--stack-first", "--no-demangle", "--no-entry", "--export-all"},
		ArtifactOutputPath: "/working/out.wasm",
		BitcodeInputs:      []string{"/working/tinygo-work/program-000.bc", "/working/tinygo-work/imported-000.bc", "/working/tinygo-work/stdlib-000.bc"},
	}) {
		t.Fatalf("unexpected lowering link job: %#v", loweringPlanManifest.LinkJob)
	}
	var backendInputManifest struct {
		EntryFile    string               `json:"entryFile"`
		CompileJobs  []LoweringCompileJob `json:"compileJobs"`
		LinkJob      LoweringLinkJob      `json:"linkJob"`
	}
	if err := json.Unmarshal([]byte(result.GeneratedFiles[6].Contents), &backendInputManifest); err != nil {
		t.Fatalf("json.Unmarshal(backend-input): %v", err)
	}
	if backendInputManifest.EntryFile != "/workspace/main.go" ||
		!reflect.DeepEqual(backendInputManifest.CompileJobs, loweringPlanManifest.CompileJobs) ||
		backendInputManifest.LinkJob.Linker != loweringPlanManifest.LinkJob.Linker ||
		!reflect.DeepEqual(backendInputManifest.LinkJob.LDFlags, loweringPlanManifest.LinkJob.LDFlags) ||
		backendInputManifest.LinkJob.ArtifactOutputPath != loweringPlanManifest.LinkJob.ArtifactOutputPath {
		t.Fatalf("unexpected backend input manifest: %#v", backendInputManifest)
	}
	if strings.Contains(result.GeneratedFiles[6].Contents, "\"loweredUnits\"") {
		t.Fatalf("expected backend input manifest to omit lowered units: %q", result.GeneratedFiles[6].Contents)
	}
	if strings.Contains(result.GeneratedFiles[6].Contents, "\"bitcodeInputs\"") {
		t.Fatalf("expected backend input manifest to omit bitcode inputs: %q", result.GeneratedFiles[6].Contents)
	}
	if len(result.Diagnostics) == 0 || !strings.Contains(result.Diagnostics[0], "frontend prepared 6 compile groups") {
		t.Fatalf("unexpected diagnostics: %#v", result.Diagnostics)
	}
}

func TestBuildRejectsEntryMissingFromProgramFiles(t *testing.T) {
	_, err := Build(Input{
		Toolchain: Toolchain{
			Target:              "wasm",
			TranslationUnitPath: "/working/tinygo-bootstrap.c",
			ObjectOutputPath:    "/working/tinygo-bootstrap.o",
			ArtifactOutputPath:  "/working/out.wasm",
		},
		EntryFile: "/workspace/main.go",
		SourceSelection: SourceSelection{
			AllCompile: []string{
				"/workspace/helper.go",
			},
		},
		CompileUnits: []IntermediateCompileUnit{
			{Kind: "program", PackageDir: "/workspace", Files: []string{"/workspace/helper.go"}},
		},
	})
	if err == nil {
		t.Fatalf("expected validation error")
	}
	if !strings.Contains(err.Error(), "entry file must be present in program files") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestBuildDefaultsBootstrapPaths(t *testing.T) {
	result, err := Build(Input{
		Toolchain: Toolchain{
			Target:             "wasm",
			LLVMTarget:         "wasm32-unknown-wasi",
			Linker:             "wasm-ld",
			ArtifactOutputPath: "/working/out.wasm",
		},
		EntryFile: "/workspace/main.go",
		SourceSelection: SourceSelection{
			AllCompile: []string{
				"/workspace/main.go",
			},
		},
		CompileUnits: []IntermediateCompileUnit{
			{Kind: "program", PackageDir: "/workspace", Files: []string{"/workspace/main.go"}},
		},
	})
	if err != nil {
		t.Fatalf("Build returned error: %v", err)
	}
	if !result.OK {
		t.Fatalf("unexpected result: %#v", result)
	}
	if got := []string{result.GeneratedFiles[0].Path, result.GeneratedFiles[1].Path, result.GeneratedFiles[2].Path, result.GeneratedFiles[3].Path, result.GeneratedFiles[4].Path, result.GeneratedFiles[5].Path, result.GeneratedFiles[6].Path}; !reflect.DeepEqual(got, []string{
		"/working/tinygo-bootstrap.c",
		"/working/tinygo-compile-unit.json",
		"/working/tinygo-intermediate.json",
		"/working/tinygo-lowering-input.json",
		"/working/tinygo-work-items.json",
		"/working/tinygo-lowering-plan.json",
		"/working/tinygo-backend-input.json",
	}) {
		t.Fatalf("unexpected generated files: %#v", result.GeneratedFiles)
	}
	if strings.Contains(result.GeneratedFiles[1].Contents, "\"translationUnitPath\":\"/working/tinygo-bootstrap.c\"") ||
		strings.Contains(result.GeneratedFiles[1].Contents, "\"objectOutputPath\":\"/working/tinygo-bootstrap.o\"") ||
		strings.Contains(result.GeneratedFiles[1].Contents, "\"packageLayout\":") {
		t.Fatalf("expected compile unit manifest to omit default bootstrap paths and package layout: %q", result.GeneratedFiles[1].Contents)
	}
}

func TestExecutePathsWritesFrontendResult(t *testing.T) {
	dir := t.TempDir()
	inputPath := filepath.Join(dir, "tinygo-frontend-input.json")
	resultPath := filepath.Join(dir, "tinygo-frontend-result.json")
	inputData, err := json.Marshal(Input{
		Toolchain: Toolchain{
			Target:             "wasm",
			ArtifactOutputPath: "/working/out.wasm",
		},
		EntryFile: "/workspace/main.go",
		SourceSelection: SourceSelection{
			AllCompile: []string{
				"/workspace/main.go",
			},
		},
		CompileUnits: []IntermediateCompileUnit{
			{Kind: "program", PackageDir: "/workspace", Files: []string{"/workspace/main.go"}},
		},
	})
	if err != nil {
		t.Fatalf("json.Marshal(input): %v", err)
	}
	if err := os.WriteFile(inputPath, inputData, 0o644); err != nil {
		t.Fatalf("os.WriteFile(input): %v", err)
	}

	if err := ExecutePaths(inputPath, resultPath); err != nil {
		t.Fatalf("ExecutePaths returned error: %v", err)
	}

	resultData, err := os.ReadFile(resultPath)
	if err != nil {
		t.Fatalf("os.ReadFile(result): %v", err)
	}
	var result Result
	if err := json.Unmarshal(resultData, &result); err != nil {
		t.Fatalf("json.Unmarshal(result): %v", err)
	}
	if !result.OK {
		t.Fatalf("unexpected result: %#v", result)
	}
	if len(result.GeneratedFiles) != 7 || result.GeneratedFiles[0].Path != "/working/tinygo-bootstrap.c" || result.GeneratedFiles[1].Path != "/working/tinygo-compile-unit.json" || result.GeneratedFiles[2].Path != "/working/tinygo-intermediate.json" || result.GeneratedFiles[3].Path != "/working/tinygo-lowering-input.json" || result.GeneratedFiles[4].Path != "/working/tinygo-work-items.json" || result.GeneratedFiles[5].Path != "/working/tinygo-lowering-plan.json" || result.GeneratedFiles[6].Path != "/working/tinygo-backend-input.json" {
		t.Fatalf("unexpected generated files: %#v", result.GeneratedFiles)
	}
	if !strings.Contains(result.GeneratedFiles[1].Contents, "\"toolchain\":{\"target\":\"wasm\",\"artifactOutputPath\":\"/working/out.wasm\"}") ||
		!strings.Contains(result.GeneratedFiles[1].Contents, "\"sourceSelection\":{\"allCompile\":[\"/workspace/main.go\"]}") ||
		!strings.Contains(result.GeneratedFiles[1].Contents, "\"materializedFiles\":[\"/working/.tinygo-root/src/device/arm/arm.go\",\"/working/.tinygo-root/src/runtime/asm_tinygowasm.S\",\"/working/.tinygo-root/src/runtime/gc_boehm.c\",\"/working/.tinygo-root/src/runtime/internal/sys/zversion.go\",\"/working/.tinygo-root/targets/wasm-undefined.txt\",\"/working/.tinygo-root/targets/wasm.json\",\"/working/tinygo-bootstrap.c\",\"/working/tinygo-compile-unit.json\"]") {
		t.Fatalf("unexpected compile unit manifest: %q", result.GeneratedFiles[1].Contents)
	}
	for _, unexpected := range []string{
		"/working/tinygo-bootstrap.json",
		"/working/tinygo-frontend-input.json",
	} {
		if strings.Contains(result.GeneratedFiles[1].Contents, unexpected) {
			t.Fatalf("expected execute compile unit manifest to omit planner handoff file %q: %q", unexpected, result.GeneratedFiles[1].Contents)
		}
		if strings.Contains(result.GeneratedFiles[0].Contents, unexpected) {
			t.Fatalf("expected execute bootstrap source to omit planner handoff file %q: %q", unexpected, result.GeneratedFiles[0].Contents)
		}
	}
	for _, unexpected := range []string{
		"\"targetAssets\":",
		"\"runtimeSupport\":",
		"\"imported\":",
		"\"stdlib\":",
		"\"program\":",
		"\"packageFileCount\":",
		"\"importedPackageFileCount\":",
		"\"stdlibPackageFileCount\":",
		"\"allFileCount\":",
		"\"targetAssetCount\":",
		"\"runtimeSupportFileCount\":",
		"\"programFileCount\":",
		"\"materializedFileCount\":",
	} {
		if strings.Contains(result.GeneratedFiles[1].Contents, unexpected) {
			t.Fatalf("expected execute compile unit manifest to omit %s: %q", unexpected, result.GeneratedFiles[1].Contents)
		}
	}
	var executeCompileUnitManifest map[string]any
	if err := json.Unmarshal([]byte(result.GeneratedFiles[1].Contents), &executeCompileUnitManifest); err != nil {
		t.Fatalf("json.Unmarshal(execute compile-unit): %v", err)
	}
	for _, key := range []string{
		"target",
		"llvmTarget",
		"linker",
		"modulePath",
		"imports",
		"buildTags",
		"packageLayout",
		"translationUnitPath",
		"objectOutputPath",
		"artifactOutputPath",
		"packageFiles",
		"importedPackageFiles",
		"stdlibPackageFiles",
		"allFiles",
		"allCompileFiles",
		"targetAssetFiles",
		"runtimeSupportFiles",
		"programFiles",
		"packageFileCount",
		"importedPackageFileCount",
		"stdlibPackageFileCount",
		"allFileCount",
		"targetAssetCount",
		"runtimeSupportFileCount",
		"programFileCount",
		"materializedFileCount",
	} {
		if _, ok := executeCompileUnitManifest[key]; ok {
			t.Fatalf("expected compile unit manifest to omit top-level %q: %#v", key, executeCompileUnitManifest)
		}
	}
	if _, err := os.Stat(filepath.Join(dir, "tinygo-compile-request.json")); !os.IsNotExist(err) {
		t.Fatalf("expected compile request artifact to be omitted, got err=%v", err)
	}
}

func TestBuildRejectsLegacyTopLevelSourceGroupsWithoutNestedSourceSelection(t *testing.T) {
	_, err := Build(Input{
		Target:              "wasm",
		LLVMTarget:          "wasm32-unknown-wasi",
		Linker:              "wasm-ld",
		EntryFile:           "/workspace/main.go",
		TranslationUnitPath: "/working/tinygo-bootstrap.c",
		ObjectOutputPath:    "/working/tinygo-bootstrap.o",
		ArtifactOutputPath:  "/working/out.wasm",
		TargetAssetFiles: []string{
			"/working/.tinygo-root/targets/wasm.json",
		},
		RuntimeSupportFiles: []string{
			"/working/.tinygo-root/src/runtime/runtime.go",
		},
		ProgramFiles: []string{
			"/workspace/main.go",
		},
		ImportedPackageFiles: []string{},
		StdlibPackageFiles: []string{
			"/working/.tinygo-root/src/fmt/print.go",
		},
		AllCompileFiles: []string{
			"/working/.tinygo-root/src/fmt/print.go",
			"/workspace/main.go",
		},
	})
	if err == nil {
		t.Fatalf("expected validation error")
	}
	if !strings.Contains(err.Error(), "toolchain is required") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestBuildRejectsLegacyTopLevelSourceGroupsEvenWithNestedSourceSelection(t *testing.T) {
	_, err := Build(Input{
		Toolchain: Toolchain{
			Target:             "wasm",
			ArtifactOutputPath: "/working/out.wasm",
		},
		EntryFile: "/workspace/main.go",
		SourceSelection: SourceSelection{
			AllCompile: []string{
				"/workspace/main.go",
			},
		},
		ProgramFiles: []string{
			"/workspace/main.go",
		},
	})
	if err == nil {
		t.Fatalf("expected validation error")
	}
	if !strings.Contains(err.Error(), "legacy top-level source selection fields are not supported") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestBuildRejectsMissingCompileUnits(t *testing.T) {
	_, err := Build(Input{
		Toolchain: Toolchain{
			Target:             "wasm",
			ArtifactOutputPath: "/working/out.wasm",
		},
		EntryFile: "/workspace/main.go",
		SourceSelection: SourceSelection{
			AllCompile: []string{
				"/workspace/main.go",
			},
		},
	})
	if err == nil {
		t.Fatalf("expected validation error")
	}
	if !strings.Contains(err.Error(), "compile units are required") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestBuildRejectsCompileUnitsMissingAllCompileFile(t *testing.T) {
	_, err := Build(Input{
		Toolchain: Toolchain{
			Target:             "wasm",
			ArtifactOutputPath: "/working/out.wasm",
		},
		EntryFile: "/workspace/main.go",
		SourceSelection: SourceSelection{
			AllCompile: []string{
				"/workspace/helper.go",
				"/workspace/main.go",
			},
		},
		CompileUnits: []IntermediateCompileUnit{
			{Kind: "program", PackageDir: "/workspace", Files: []string{"/workspace/main.go"}},
		},
	})
	if err == nil {
		t.Fatalf("expected validation error")
	}
	if !strings.Contains(err.Error(), "compile units must cover every allCompile file") {
		t.Fatalf("unexpected error: %v", err)
	}
}
