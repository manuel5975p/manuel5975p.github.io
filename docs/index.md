# Welcome

## What is it?

raygpu is a fast and simple Graphics Library written in C99, inspired by and based on [raylib](https://github.com/raysan5/raylib/). It targets Vulkan 1.1 or Vulkan 1.3 through [WGVK](https://github.com/manuel5975p/WGVK/) and WebGPU through [Dawn](https://dawn.googlesource.com/dawn) and [emdawnwebgpu](https://dawn.googlesource.com/dawn), a C wrapper for the WebGPU JS Api.
<p align="center">
<image src="diagram.svg", width="700px"/>
</p>
Targeting Vulkan, Metal, DirectX 11/12, OpenGL (ES) and the WebGPU API in browsers makes raygpu a viable choice for portable desktop and browser application.

## Starter Code
Designed to be as easy to use as possible, this is all the code required for a starter application.
```cpp { .yaml .copy }
#include <raygpu.h>
int main(){
    InitWindow(500, 500, "Window");
    while(!WindowShouldClose()){
        BeginDrawing();
        ClearBackground(BLACK);
        DrawCircle(GetMouseX(), GetMouseY(), 50, 50, RED); //Draw a red circle at the cursor's position
        EndDrawing();
    }
}
```

## Building
### Minimal compile command
Compiling a raygpu program for Web is as easy as running 
```bash { .yaml .copy }
emcc --use-port=emdawnwebgpu examples/core_shapes.c src/*.c -I include -I amalgamation/SPIRV-Reflect/ -sUSE_GLFW=3 -sALLOW_MEMORY_GROWTH=1 -sSINGLE_FILE=1 -o core_shapes.html
```

- `--use-port=emdawnwebgpu`: Use dawn's WebGPU bindings (might soon become -sUSE_WEBGPU=1)
- `examples/core_shapes.c src/*.c`: One example's and the library's source code
- `-I include -I amalgamation/SPIRV-Reflect/`: The required include directories
- `-sUSE_GLFW=3`: Link emscriptens glfw3 library
- `-sALLOW_MEMORY_GROWTH`: Don't get hit by out of memory errors, instead resize
- `-sSINGLE_FILE`: Produce a single, "executable" html file
- `-o core_shapes.html`: The output filename
Make sure you have a recent version of emscripten installed.
___

### CMake

The primarily supported way to build is through CMake. Using the vulkan backend with GLSL Shaders and GLFW is also buildable with a plain Makefile.

The CMake config supports a couple of options, namely

- `SUPPORT_WGPU_BACKEND`
- `SUPPORT_VULKAN_BACKEND`
- `SUPPORT_GLFW`
- `SUPPORT_SDL3`
- `SUPPORT_GLSL_PARSER`
- `SUPPORT_WGSL_PARSER`

The options `SUPPORT_WGPU_BACKEND` and `SUPPORT_VULKAN_BACKEND` are mutually exclusive and one must be set.

Those options can be appended to a cmake command line like this example:

`cmake .. -DSUPPORT_VULKAN_BACKEND=ON -DSUPPORT_GLSL_PARSER=ON -DSUPPORT_GLFW=ON`

**Omitting both the `SUPPORT_WGPU_BACKEND` and `SUPPORT_WGSL_BACKEND` drastically reduces build-time, as dawn and tint are not built!**

For more info on cmake, scroll down to [the CMake section](#cmake)


#### Makefile
```
git clone https://github.com/manuel5975p/raygpu/
cd raygpu
make
# or
make -j $(nproc)
```
builds a static library `libraygpu.a` with the glfw and glslang libraries baked in.
From there, an example can be built using
```
g++ examples/core_window.c -o core_window -DSUPPORT_VULKAN_BACKEND=1 -I include/ -L . -lraygpu
```
#### CMake
If you want to add `raygpu` to your current project, add these snippets to your `CMakeLists.txt`:
```cmake { .yaml .copy }
# This is to support FetchContent in the first place.
# Ignore if you already include it.
cmake_minimum_required(VERSION 3.19)
include(FetchContent)

FetchContent_Declare(
    raygpu_git
    GIT_REPOSITORY https://github.com/manuel5975p/raygpu.git
    GIT_SHALLOW True #optional, enable --depth 1 (shallow) clone
)
FetchContent_MakeAvailable(raygpu_git)

target_link_libraries(<your target> PUBLIC raygpu)
```
___
#### Building for Linux or MacOS

Linux requires

- Ubuntu/Debian: `sudo apt install libvulkan-dev`
- Arch / Manjaro: `sudo pacman -S vulkan-headers vulkan-swrast`
- Fedora: `sudo dnf install vulkan`

```bash
git clone https://github.com/manuel5975p/raygpu.git
cd raygpu
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release # optionally: -GNinja

make -j8 # or ninja i.a.
./examples/core_window
```
___
#### Building for Windows
```bash
git clone https://github.com/manuel5975p/raygpu.git
cd raygpu
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release -G "Visual Studio 17 2022"
```
See the complete [list of generators](https://cmake.org/cmake/help/latest/manual/cmake-generators.7.html) for older Visual Studio versions.

#### Building for Web
Building for web simply requires

  - Using the WebGPU backend
  - Having [emscripten](https://emscripten.org/docs/getting_started/downloads.html) installed

```bash
git clone https://github.com/manuel5975p/raygpu.git
cd raygpu
mkdir build && cd build
emcmake cmake .. -DSUPPORT_WGPU_BACKEND=ON -DCMAKE_BUILD_TYPE=Release
```
