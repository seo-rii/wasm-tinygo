package main

import (
	"fmt"
	"os"

	"wasm-tinygo/internal/driver"
	"wasm-tinygo/internal/tinygobackend"
	"wasm-tinygo/internal/tinygofrontend"
)

func main() {
	switch os.Getenv("WASM_TINYGO_MODE") {
	case "frontend":
		if err := tinygofrontend.ExecutePaths("/working/tinygo-frontend-input.json", "/working/tinygo-frontend-result.json"); err != nil {
			fmt.Println("tinygo frontend failed:", err)
			os.Exit(1)
		}
		fmt.Println("tinygo frontend prepared bootstrap compile request")
	case "backend":
		if err := tinygobackend.ExecutePaths("/working/tinygo-backend-input.json", "/working/tinygo-backend-result.json"); err != nil {
			fmt.Println("tinygo backend failed:", err)
			os.Exit(1)
		}
		fmt.Println("tinygo backend prepared command batch")
	default:
		if err := driver.ExecutePaths("/workspace/tinygo-request.json", "/workspace/tinygo-result.json"); err != nil {
			fmt.Println("tinygo driver failed:", err)
			os.Exit(1)
		}
		fmt.Println("tinygo driver planned bootstrap build")
	}
}
