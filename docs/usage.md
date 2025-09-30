# Usage
A very basic usage example:
```c
#include <raygpu.h>
int main(){
    InitWindow(800, 600, "Title");
    while(!WindowShouldClose()){
        BeginDrawing();
        ClearBackground(GREEN);
        DrawText("Hello there!", 200, 200, 30, BLACK);
        EndDrawing();
    }
}
```
___

## Emscripten

TLDR

- Use `emscripten_set_main_loop` to use raygpu with `-sASYNCIFY=2 -DASSUME_EM_ASYNCIFY`
- Use `InitProgram` to use raygpu without `-sASYNCIFY`

___
 
### The Render Loop


C/C++ programs usually implement a render loop as a regular while loop:
```cpp
int main(){
    // Init
    while(!WindowShouldClose()){
        // Render and present
    }
}
```
When the program flow returns from `main`, the application is finished and exits. `int main` is therefore a big, blocking function that "blocks" until the end of the programs life.
___
### Behaviour under emscripten

In WebAssembly via Emscripten, main is only the entry point. Once it returns, control goes back to the browser. To keep running, you must explicitly schedule a loop with emscripten_set_main_loop. A plain blocking loop inside main will freeze the page - no input, no redraw, and the tab becomes unresponsive until closed. The same applies in JavaScript: an endless loop blocks the event loop and locks the page.

#### Asyncify


Emscripten's developers have come up with a fix to this: the `-sASYNCIFY` flag: It generates wasm that can be interrupted by the browser to get some time to do input processing, to be resumed in the exact same state right after. This comes with an overhead both in code size and performance.

With WebGPU the Renderloop is not the only place where returning the program flow to the browser is required. The functions `wgpuInstanceRequestAdapter` and `wgpuAdapterRequestDevice` both return a `WGPUFuture`, which hands you the created Adapter / Device in a callback. Those callbacks only fire when 

- Control is back at the browser (no wasm running from our side)
- You explicitly calling `wgpuInstanceWaitAny` on the Future (requires `-sASYNCIFY=2`!!) 

So in short: Without `ASYNCIFY`, **neither** `InitWindow` nor the renderloop can live inside `int main`.

#### InitProgram
RayGPU provides `InitProgram(ProgramInfo info)` to handle initialization, run a setup function once, and manage the render loop:

```c { .yaml .copy }
#include <raygpu.h>
Texture tex = {0};

// This function only runs once
void setup(){
    tex = LoadTextureFromImage(GenImageChecker(WHITE, BLACK, 100, 100, 10));
}

// This function gets called repeatedly
void render(){
    BeginDrawing();
    ClearBackground((Color) {20,50,50,255});
        
    DrawRectangle(100,100,100,100,WHITE);
    DrawTexturePro(tex, CLITERAL(Rectangle) {0,0,100,100}, CLITERAL(Rectangle){200,100,100,100}, (Vector2){0,0}, 0.0f, WHITE);
    DrawCircle(GetMouseX(), GetMouseY(), 40, WHITE);
    DrawCircleV(GetMousePosition(), 20, CLITERAL(Color){255,0,0,255});
    DrawCircle(600, 300, 200, CLITERAL(Color){255,0,0,100});
    
    DrawFPS(5, 5);
    EndDrawing();
}

int main(void){
    ProgramInfo program = {
        .windowTitle = "Shapes Example",
        .windowWidth = 800,
        .windowHeight = 600,
        .setupFunction = setup,
        .renderFunction = render
    };
    InitProgram(program); //This function blocks on desktop
}
```
When compiled for a desktop platform, the call to InitProgram is equivalent to this:
```c
InitWindow(800, 600, "Shapes Example");
setup();
while(!WindowShouldClose()){
    render();
}
```
On wasm, the internal logic differs to avoid blocking, but the result is equivalent.