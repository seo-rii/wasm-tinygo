package tinygofrontend

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"wasm-tinygo/internal/tinygobackend"
	"wasm-tinygo/internal/tinygobootstrap"
	"wasm-tinygo/internal/tinygoroot"
	"wasm-tinygo/internal/tinygotarget"
)

type Input struct {
	Toolchain            Toolchain       `json:"toolchain"`
	Target               string          `json:"target"`
	LLVMTarget           string          `json:"llvmTarget"`
	Linker               string          `json:"linker"`
	CFlags               []string        `json:"cflags"`
	LDFlags              []string        `json:"ldflags"`
	OptimizeFlag         string          `json:"optimizeFlag"`
	EntryFile            string          `json:"entryFile"`
	TranslationUnitPath  string          `json:"translationUnitPath"`
	ObjectOutputPath     string          `json:"objectOutputPath"`
	ArtifactOutputPath   string          `json:"artifactOutputPath"`
	SourceSelection      SourceSelection `json:"sourceSelection"`
	CompileUnits         []IntermediateCompileUnit `json:"compileUnits,omitempty"`
	TargetAssetFiles     []string        `json:"targetAssetFiles"`
	RuntimeSupportFiles  []string        `json:"runtimeSupportFiles"`
	ProgramFiles         []string        `json:"programFiles"`
	ImportedPackageFiles []string        `json:"importedPackageFiles"`
	StdlibPackageFiles   []string        `json:"stdlibPackageFiles"`
	AllCompileFiles      []string        `json:"allCompileFiles"`
}

type Toolchain struct {
	Target              string   `json:"target"`
	LLVMTarget          string   `json:"llvmTarget"`
	Linker              string   `json:"linker"`
	CFlags              []string `json:"cflags"`
	LDFlags             []string `json:"ldflags"`
	TranslationUnitPath string   `json:"translationUnitPath"`
	ObjectOutputPath    string   `json:"objectOutputPath"`
	ArtifactOutputPath  string   `json:"artifactOutputPath"`
}

type SourceSelection struct {
	AllCompile []string `json:"allCompile"`
}

type GeneratedFile struct {
	Path     string `json:"path"`
	Contents string `json:"contents"`
}

type CompileGroup struct {
	Name  string   `json:"name"`
	Files []string `json:"files"`
}

type IntermediateSourceSelection struct {
	TargetAssets   []string `json:"targetAssets"`
	RuntimeSupport []string `json:"runtimeSupport"`
	Program        []string `json:"program"`
	Imported       []string `json:"imported"`
	Stdlib         []string `json:"stdlib"`
	AllCompile     []string `json:"allCompile"`
}

type IntermediateManifest struct {
	EntryFile       string                      `json:"entryFile"`
	OptimizeFlag    string                      `json:"optimizeFlag,omitempty"`
	Toolchain       Toolchain                   `json:"toolchain"`
	SourceSelection IntermediateSourceSelection `json:"sourceSelection"`
	CompileUnits    []IntermediateCompileUnit   `json:"compileUnits"`
}

type IntermediateCompileUnit struct {
	Kind       string   `json:"kind"`
	PackageDir string   `json:"packageDir"`
	Files      []string `json:"files"`
}

type LoweringSupport struct {
	TargetAssets   []string `json:"targetAssets"`
	RuntimeSupport []string `json:"runtimeSupport"`
}

type LoweringManifest struct {
	EntryFile    string                    `json:"entryFile"`
	OptimizeFlag string                    `json:"optimizeFlag,omitempty"`
	Toolchain    Toolchain                 `json:"toolchain"`
	Support      LoweringSupport           `json:"support"`
	CompileUnits []IntermediateCompileUnit `json:"compileUnits"`
}

type WorkItem struct {
	ID                string   `json:"id"`
	Kind              string   `json:"kind"`
	PackageDir        string   `json:"packageDir"`
	Files             []string `json:"files"`
	BitcodeOutputPath string   `json:"bitcodeOutputPath"`
}

type WorkItemsManifest struct {
	EntryFile    string     `json:"entryFile"`
	OptimizeFlag string     `json:"optimizeFlag,omitempty"`
	WorkItems    []WorkItem `json:"workItems"`
}

type LoweredBitcodeManifest struct {
	BitcodeFiles []string `json:"bitcodeFiles"`
}

type LoweringCompileJob struct {
	ID                string   `json:"id"`
	Kind              string   `json:"kind"`
	PackageDir        string   `json:"packageDir"`
	Files             []string `json:"files"`
	BitcodeOutputPath string   `json:"bitcodeOutputPath"`
	LLVMTarget        string   `json:"llvmTarget"`
	CFlags            []string `json:"cflags"`
	OptimizeFlag      string   `json:"optimizeFlag,omitempty"`
}

type LoweringLinkJob struct {
	Linker             string   `json:"linker"`
	LDFlags            []string `json:"ldflags"`
	ArtifactOutputPath string   `json:"artifactOutputPath"`
	BitcodeInputs      []string `json:"bitcodeInputs"`
}

type LoweringPlanManifest struct {
	EntryFile    string               `json:"entryFile"`
	OptimizeFlag string               `json:"optimizeFlag,omitempty"`
	CompileJobs  []LoweringCompileJob `json:"compileJobs"`
	LinkJob      LoweringLinkJob      `json:"linkJob"`
}

type Result struct {
	OK             bool            `json:"ok"`
	GeneratedFiles []GeneratedFile `json:"generatedFiles,omitempty"`
	Diagnostics    []string        `json:"diagnostics,omitempty"`
}

func Build(input Input) (Result, error) {
	if input.Toolchain.Target == "" &&
		input.Toolchain.LLVMTarget == "" &&
		input.Toolchain.Linker == "" &&
		len(input.Toolchain.CFlags) == 0 &&
		len(input.Toolchain.LDFlags) == 0 &&
		input.Toolchain.TranslationUnitPath == "" &&
		input.Toolchain.ObjectOutputPath == "" &&
		input.Toolchain.ArtifactOutputPath == "" {
		return Result{}, fmt.Errorf("toolchain is required")
	}
	if input.Target != "" || input.LLVMTarget != "" || input.Linker != "" ||
		input.TranslationUnitPath != "" || input.ObjectOutputPath != "" || input.ArtifactOutputPath != "" ||
		len(input.CFlags) != 0 || len(input.LDFlags) != 0 {
		return Result{}, fmt.Errorf("legacy top-level toolchain fields are not supported")
	}
	if len(input.TargetAssetFiles) != 0 || len(input.RuntimeSupportFiles) != 0 ||
		len(input.ProgramFiles) != 0 || len(input.ImportedPackageFiles) != 0 ||
		len(input.StdlibPackageFiles) != 0 || len(input.AllCompileFiles) != 0 {
		return Result{}, fmt.Errorf("legacy top-level source selection fields are not supported")
	}
	if input.Toolchain.Target == "" {
		return Result{}, fmt.Errorf("target is required")
	}
	llvmTarget := input.Toolchain.LLVMTarget
	linker := input.Toolchain.Linker
	cflags := append([]string{}, input.Toolchain.CFlags...)
	ldflags := append([]string{}, input.Toolchain.LDFlags...)
	if input.EntryFile == "" {
		return Result{}, fmt.Errorf("entry file is required")
	}
	if input.Toolchain.ArtifactOutputPath == "" {
		return Result{}, fmt.Errorf("artifact output path is required")
	}
	translationUnitPath := input.Toolchain.TranslationUnitPath
	if translationUnitPath == "" {
		translationUnitPath = "/working/tinygo-bootstrap.c"
	}
	objectOutputPath := input.Toolchain.ObjectOutputPath
	if objectOutputPath == "" {
		objectOutputPath = "/working/tinygo-bootstrap.o"
	}
	if input.SourceSelection.AllCompile == nil {
		return Result{}, fmt.Errorf("source selection is required")
	}
	if len(input.CompileUnits) == 0 {
		return Result{}, fmt.Errorf("compile units are required")
	}
	allCompileFileSet := map[string]struct{}{}
	for _, path := range input.SourceSelection.AllCompile {
		allCompileFileSet[path] = struct{}{}
	}
	seenCompileFiles := map[string]struct{}{}
	stdlibFiles := make([]string, 0, len(input.SourceSelection.AllCompile))
	programFiles := make([]string, 0, len(input.SourceSelection.AllCompile))
	importedFiles := make([]string, 0, len(input.SourceSelection.AllCompile))
	compileUnits := make([]IntermediateCompileUnit, 0, len(input.CompileUnits))
	for _, compileUnit := range input.CompileUnits {
		if compileUnit.Kind == "" {
			return Result{}, fmt.Errorf("compile unit kind is required")
		}
		if compileUnit.PackageDir == "" {
			return Result{}, fmt.Errorf("compile unit packageDir is required")
		}
		if len(compileUnit.Files) == 0 {
			return Result{}, fmt.Errorf("compile unit files are required")
		}
		unitFiles := append([]string{}, compileUnit.Files...)
		compileUnits = append(compileUnits, IntermediateCompileUnit{
			Kind:       compileUnit.Kind,
			PackageDir: compileUnit.PackageDir,
			Files:      unitFiles,
		})
		for _, path := range unitFiles {
			if filepath.Dir(path) != compileUnit.PackageDir {
				return Result{}, fmt.Errorf("compile unit files must stay inside packageDir")
			}
			if _, ok := allCompileFileSet[path]; !ok {
				return Result{}, fmt.Errorf("compile units must only reference allCompile files")
			}
			if _, ok := seenCompileFiles[path]; ok {
				return Result{}, fmt.Errorf("compile units must not repeat files")
			}
			seenCompileFiles[path] = struct{}{}
		}
		switch compileUnit.Kind {
		case "program":
			programFiles = append(programFiles, unitFiles...)
		case "imported":
			importedFiles = append(importedFiles, unitFiles...)
		case "stdlib":
			stdlibFiles = append(stdlibFiles, unitFiles...)
		default:
			return Result{}, fmt.Errorf("unsupported compile unit kind %q", compileUnit.Kind)
		}
	}
	if len(seenCompileFiles) != len(allCompileFileSet) {
		return Result{}, fmt.Errorf("compile units must cover every allCompile file")
	}
	entrySeen := false
	for _, path := range programFiles {
		if path == input.EntryFile {
			entrySeen = true
			break
		}
	}
	if !entrySeen {
		return Result{}, fmt.Errorf("entry file must be present in program files")
	}
	expectedCompileFiles := map[string]struct{}{}
	for _, group := range [][]string{
		programFiles,
		importedFiles,
		stdlibFiles,
	} {
		for _, path := range group {
			expectedCompileFiles[path] = struct{}{}
		}
	}
	for _, path := range input.SourceSelection.AllCompile {
		delete(expectedCompileFiles, path)
	}
	if len(expectedCompileFiles) != 0 {
		return Result{}, fmt.Errorf("all compile files must include every program/imported/stdlib file")
	}
	remainingCompileFiles := map[string]struct{}{}
	for _, path := range input.SourceSelection.AllCompile {
		remainingCompileFiles[path] = struct{}{}
	}
	for _, group := range [][]string{
		programFiles,
		importedFiles,
		stdlibFiles,
	} {
		for _, path := range group {
			delete(remainingCompileFiles, path)
		}
	}
	if len(remainingCompileFiles) != 0 {
		return Result{}, fmt.Errorf("all compile files contained files outside program/imported/stdlib groups")
	}
	profile, err := tinygotarget.Resolve(input.Toolchain.Target)
	if err != nil {
		return Result{}, err
	}
	if llvmTarget == "" {
		llvmTarget = profile.LLVMTarget
	}
	if linker == "" {
		linker = profile.Linker
	}
	if len(cflags) == 0 {
		cflags = append([]string{}, profile.CFlags...)
	}
	if len(ldflags) == 0 {
		ldflags = profile.LinkerFlags()
	}
	wantedTinyGoRootPaths := map[string]struct{}{
		"/targets/" + profile.Name + ".json":    {},
		"/src/runtime/internal/sys/zversion.go": {},
		"/src/device/arm/arm.go":                {},
	}
	for _, path := range profile.ExtraFiles {
		wantedTinyGoRootPaths["/"+strings.TrimPrefix(path, "/")] = struct{}{}
	}
	for _, flag := range profile.LDFlags {
		index := strings.Index(flag, "{root}")
		if index < 0 {
			continue
		}
		path := flag[index+len("{root}"):]
		if path != "" {
			wantedTinyGoRootPaths[path] = struct{}{}
		}
	}
	targetAssetSet := map[string]struct{}{
		tinygoroot.RootDir + "/targets/" + profile.Name + ".json": {},
	}
	for path := range wantedTinyGoRootPaths {
		fullPath := tinygoroot.RootDir + "/" + strings.TrimPrefix(path, "/")
		if strings.HasPrefix(fullPath, tinygoroot.RootDir+"/targets/") {
			targetAssetSet[fullPath] = struct{}{}
		}
	}
	targetAssets := make([]string, 0, len(targetAssetSet))
	for path := range targetAssetSet {
		targetAssets = append(targetAssets, path)
	}
	sort.Strings(targetAssets)
	stdlibFileSet := map[string]struct{}{}
	for _, path := range stdlibFiles {
		stdlibFileSet[path] = struct{}{}
	}
	runtimeSupportSet := map[string]struct{}{}
	for _, file := range tinygoroot.Files() {
		relativePath := strings.TrimPrefix(file.Path, tinygoroot.RootDir)
		if _, ok := wantedTinyGoRootPaths[relativePath]; !ok {
			continue
		}
		if strings.HasPrefix(file.Path, tinygoroot.RootDir+"/targets/") {
			continue
		}
		if _, ok := stdlibFileSet[file.Path]; ok {
			continue
		}
		runtimeSupportSet[file.Path] = struct{}{}
	}
	runtimeSupport := make([]string, 0, len(runtimeSupportSet))
	for path := range runtimeSupportSet {
		runtimeSupport = append(runtimeSupport, path)
	}
	sort.Strings(runtimeSupport)
	if llvmTarget == "" {
		return Result{}, fmt.Errorf("llvm target is required")
	}
	if linker == "" {
		return Result{}, fmt.Errorf("linker is required")
	}
	compileGroups := []CompileGroup{
		{Name: "target-assets", Files: append([]string{}, targetAssets...)},
		{Name: "runtime-support", Files: append([]string{}, runtimeSupport...)},
		{Name: "program", Files: append([]string{}, programFiles...)},
		{Name: "imported", Files: append([]string{}, importedFiles...)},
		{Name: "stdlib", Files: append([]string{}, stdlibFiles...)},
		{Name: "all-compile", Files: append([]string{}, input.SourceSelection.AllCompile...)},
	}
	compileUnitManifestPath := "/working/tinygo-compile-unit.json"
	materializedFileSet := map[string]struct{}{}
	for _, group := range [][]string{
		targetAssets,
		runtimeSupport,
		stdlibFiles,
	} {
		for _, path := range group {
			materializedFileSet[path] = struct{}{}
		}
	}
	materializedFiles := make([]string, 0, len(materializedFileSet)+2)
	for path := range materializedFileSet {
		materializedFiles = append(materializedFiles, path)
	}
	sort.Strings(materializedFiles)
	translationUnitMaterialized := false
	for _, path := range materializedFiles {
		if path == translationUnitPath {
			translationUnitMaterialized = true
			break
		}
	}
	if !translationUnitMaterialized {
		materializedFiles = append(materializedFiles, translationUnitPath)
	}
	compileUnitManifestMaterialized := false
	for _, path := range materializedFiles {
		if path == compileUnitManifestPath {
			compileUnitManifestMaterialized = true
			break
		}
	}
	if !compileUnitManifestMaterialized {
		materializedFiles = append(materializedFiles, compileUnitManifestPath)
	}
	compileUnitManifest := tinygobootstrap.CompileUnitManifest{
		EntryFile:         input.EntryFile,
		OptimizeFlag:      input.OptimizeFlag,
		MaterializedFiles: materializedFiles,
		Toolchain: tinygobootstrap.Toolchain{
			Target:             input.Toolchain.Target,
			ArtifactOutputPath: input.Toolchain.ArtifactOutputPath,
		},
		SourceSelection: tinygobootstrap.SourceSelection{
			AllCompile: append([]string{}, input.SourceSelection.AllCompile...),
		},
	}
	if input.Toolchain.LLVMTarget != "" {
		compileUnitManifest.Toolchain.LLVMTarget = llvmTarget
	}
	if input.Toolchain.Linker != "" {
		compileUnitManifest.Toolchain.Linker = linker
	}
	if len(input.Toolchain.CFlags) != 0 {
		compileUnitManifest.Toolchain.CFlags = cflags
	}
	if len(input.Toolchain.LDFlags) != 0 {
		compileUnitManifest.Toolchain.LDFlags = ldflags
	}
	if input.Toolchain.TranslationUnitPath != "" {
		compileUnitManifest.Toolchain.TranslationUnitPath = translationUnitPath
	}
	if input.Toolchain.ObjectOutputPath != "" {
		compileUnitManifest.Toolchain.ObjectOutputPath = objectOutputPath
	}
	bootstrapOutput, err := tinygobootstrap.Generate(tinygobootstrap.Input{
		CompileUnitManifest: compileUnitManifest,
		OptimizeFlag:        input.OptimizeFlag,
	})
	if err != nil {
		return Result{}, err
	}
	intermediateLDFlags := append([]string{}, ldflags...)
	for _, flag := range []string{"--no-entry", "--export-all"} {
		present := false
		for _, existing := range intermediateLDFlags {
			if existing == flag {
				present = true
				break
			}
		}
		if !present {
			intermediateLDFlags = append(intermediateLDFlags, flag)
		}
	}
	intermediateManifestContents, err := json.Marshal(IntermediateManifest{
		EntryFile:    input.EntryFile,
		OptimizeFlag: input.OptimizeFlag,
		Toolchain: Toolchain{
			Target:              input.Toolchain.Target,
			LLVMTarget:          llvmTarget,
			Linker:              linker,
			CFlags:              append([]string{}, cflags...),
			LDFlags:             intermediateLDFlags,
			TranslationUnitPath: translationUnitPath,
			ObjectOutputPath:    objectOutputPath,
			ArtifactOutputPath:  input.Toolchain.ArtifactOutputPath,
		},
		SourceSelection: IntermediateSourceSelection{
			TargetAssets:   append([]string{}, targetAssets...),
			RuntimeSupport: append([]string{}, runtimeSupport...),
			Program:        append([]string{}, programFiles...),
			Imported:       append([]string{}, importedFiles...),
			Stdlib:         append([]string{}, stdlibFiles...),
			AllCompile:     append([]string{}, input.SourceSelection.AllCompile...),
		},
		CompileUnits: compileUnits,
	})
	if err != nil {
		return Result{}, err
	}
	loweringManifestContents, err := json.Marshal(LoweringManifest{
		EntryFile:    input.EntryFile,
		OptimizeFlag: input.OptimizeFlag,
		Toolchain: Toolchain{
			Target:              input.Toolchain.Target,
			LLVMTarget:          llvmTarget,
			Linker:              linker,
			CFlags:              append([]string{}, cflags...),
			LDFlags:             intermediateLDFlags,
			TranslationUnitPath: translationUnitPath,
			ObjectOutputPath:    objectOutputPath,
			ArtifactOutputPath:  input.Toolchain.ArtifactOutputPath,
		},
		Support: LoweringSupport{
			TargetAssets:   append([]string{}, targetAssets...),
			RuntimeSupport: append([]string{}, runtimeSupport...),
		},
		CompileUnits: compileUnits,
	})
	if err != nil {
		return Result{}, err
	}
	workItems := make([]WorkItem, 0, len(compileUnits))
	kindIndexes := map[string]int{}
	for _, compileUnit := range compileUnits {
		kindIndex := kindIndexes[compileUnit.Kind]
		kindIndexes[compileUnit.Kind] = kindIndex + 1
		workItemID := fmt.Sprintf("%s-%03d", compileUnit.Kind, kindIndex)
		workItems = append(workItems, WorkItem{
			ID:                workItemID,
			Kind:              compileUnit.Kind,
			PackageDir:        compileUnit.PackageDir,
			Files:             append([]string{}, compileUnit.Files...),
			BitcodeOutputPath: "/working/tinygo-work/" + workItemID + ".bc",
		})
	}
	workItemsManifestContents, err := json.Marshal(WorkItemsManifest{
		EntryFile:    input.EntryFile,
		OptimizeFlag: input.OptimizeFlag,
		WorkItems:    workItems,
	})
	if err != nil {
		return Result{}, err
	}
	compileJobs := make([]LoweringCompileJob, 0, len(workItems))
	for _, workItem := range workItems {
		compileJobs = append(compileJobs, LoweringCompileJob{
			ID:                workItem.ID,
			Kind:              workItem.Kind,
			PackageDir:        workItem.PackageDir,
			Files:             append([]string{}, workItem.Files...),
			BitcodeOutputPath: workItem.BitcodeOutputPath,
			LLVMTarget:        llvmTarget,
			CFlags:            append([]string{}, cflags...),
			OptimizeFlag:      input.OptimizeFlag,
		})
	}
	linkBitcodeInputs := make([]string, 0, len(workItems))
	for _, workItem := range workItems {
		linkBitcodeInputs = append(linkBitcodeInputs, workItem.BitcodeOutputPath)
	}
	loweringPlanManifestContents, err := json.Marshal(LoweringPlanManifest{
		EntryFile:    input.EntryFile,
		OptimizeFlag: input.OptimizeFlag,
		CompileJobs:  compileJobs,
		LinkJob: LoweringLinkJob{
			Linker:             linker,
			LDFlags:            append([]string{}, intermediateLDFlags...),
			ArtifactOutputPath: input.Toolchain.ArtifactOutputPath,
			BitcodeInputs:      linkBitcodeInputs,
		},
	})
	if err != nil {
		return Result{}, err
	}
	backendCompileJobs := make([]tinygobackend.CompileJob, 0, len(compileJobs))
	for _, compileJob := range compileJobs {
		backendCompileJobs = append(backendCompileJobs, tinygobackend.CompileJob{
			ID:                compileJob.ID,
			Kind:              compileJob.Kind,
			PackageDir:        compileJob.PackageDir,
			Files:             append([]string{}, compileJob.Files...),
			BitcodeOutputPath: compileJob.BitcodeOutputPath,
			LLVMTarget:        compileJob.LLVMTarget,
			CFlags:            append([]string{}, compileJob.CFlags...),
			OptimizeFlag:      compileJob.OptimizeFlag,
		})
	}
	backendInput := tinygobackend.Input{
		EntryFile:   input.EntryFile,
		CompileJobs: backendCompileJobs,
		LinkJob: tinygobackend.LinkJob{
			Linker:             linker,
			LDFlags:            append([]string{}, intermediateLDFlags...),
			ArtifactOutputPath: input.Toolchain.ArtifactOutputPath,
		},
	}
	backendInputManifestContents, err := json.Marshal(backendInput)
	if err != nil {
		return Result{}, err
	}
	compileUnitManifestContents := []byte(bootstrapOutput.EmbeddedManifest)
	generatedFiles := []GeneratedFile{
		{
			Path:     translationUnitPath,
			Contents: bootstrapOutput.Source,
		},
		{
			Path:     compileUnitManifestPath,
			Contents: string(compileUnitManifestContents),
		},
		{
			Path:     "/working/tinygo-intermediate.json",
			Contents: string(intermediateManifestContents),
		},
		{
			Path:     "/working/tinygo-lowering-input.json",
			Contents: string(loweringManifestContents),
		},
		{
			Path:     "/working/tinygo-work-items.json",
			Contents: string(workItemsManifestContents),
		},
	}
	generatedFiles = append(generatedFiles,
		GeneratedFile{
			Path:     "/working/tinygo-lowering-plan.json",
			Contents: string(loweringPlanManifestContents),
		},
		GeneratedFile{
			Path:     "/working/tinygo-backend-input.json",
			Contents: string(backendInputManifestContents),
		},
	)
	return Result{
		OK:             true,
		GeneratedFiles: generatedFiles,
		Diagnostics: []string{
			fmt.Sprintf("tinygo frontend prepared %d compile groups for %s", len(compileGroups), input.Toolchain.Target),
		},
	}, nil
}

func ExecutePaths(inputPath, resultPath string) error {
	inputData, err := os.ReadFile(inputPath)
	if err != nil {
		return err
	}

	var input Input
	if err := json.Unmarshal(inputData, &input); err != nil {
		return err
	}

	result, err := Build(input)
	if err != nil {
		failedResult := Result{
			OK:          false,
			Diagnostics: []string{err.Error()},
		}
		resultData, marshalErr := json.Marshal(failedResult)
		if marshalErr != nil {
			return marshalErr
		}
		if writeErr := os.WriteFile(resultPath, resultData, 0o644); writeErr != nil {
			return writeErr
		}
		return err
	}

	resultData, err := json.Marshal(result)
	if err != nil {
		return err
	}

	return os.WriteFile(resultPath, resultData, 0o644)
}
