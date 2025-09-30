---

### Initialization

The initialization functions set up the rendering backend, create a window, and manage the main application loop.

*   **`void InitWindow(int width, int height, const char* title)`**
    This is the primary function to initialize a window and the graphics context. It should be the first RayGPU function you call.

*   **`void InitProgram(ProgramInfo program)`**
    A more structured way to initialize your application, taking a struct with window parameters and pointers to your `setup` and `render` functions.

*   **`bool WindowShouldClose(void)`**
    This function returns `true` if the user has attempted to close the window (e.g., by clicking the 'X' button). It is typically used as the condition for the main game loop.

*   **`void BeginDrawing(void)`** and **`void EndDrawing(void)`**
    These functions mark the beginning and end of a single frame's drawing commands. All drawing must happen between these two calls. `EndDrawing` handles buffer swapping and frame timing.

*   **`void ClearBackground(Color color)`**
    Clears the entire screen to a specified color.

*   **`void SetConfigFlags(int flag)`**
    Sets configuration flags for the window before it is created with `InitWindow`. Flags include `FLAG_FULLSCREEN_MODE`, `FLAG_WINDOW_RESIZABLE`, `FLAG_VSYNC_HINT`, and `FLAG_MSAA_4X_HINT`.

**Example: Basic Window and Main Loop**
```c
#include "raygpu.h"

int main(void) {
    InitWindow(800, 600, "My RayGPU Window");
    SetTargetFPS(60);

    while (!WindowShouldClose()) {
        BeginDrawing();
        ClearBackground(RAYWHITE);
        DrawText("Hello, World!", 190, 200, 20, BLACK);
        EndDrawing();
    }

    // CloseWindow() is handled implicitly on loop exit in some backends,
    // but cleanup functions for custom resources are the user's responsibility.
    return 0;
}
```

**Example: Using `InitProgram`**
```c
#include "raygpu.h"

void Setup() {
    // Initialization code goes here
    SetTargetFPS(60);
}

void Render() {
    // Drawing code for one frame goes here
    BeginDrawing();
    ClearBackground(DARKBLUE);
    DrawFPS(10, 10);
    EndDrawing();
}

int main(void) {
    ProgramInfo info = {
        .windowTitle = "InitProgram Example",
        .windowWidth = 1280,
        .windowHeight = 720,
        .setupFunction = Setup,
        .renderFunction = Render,
    };
    InitProgram(info);
    return 0;
}
```

---

### Input

RayGPU provides a simple interface for polling keyboard, mouse, and touch input state once per frame.

*   **`bool IsKeyDown(int key)`**: Checks if a key is currently being held down.
*   **`bool IsKeyPressed(int key)`**: Checks if a key was just pressed in the current frame.
*   **`bool IsMouseButtonDown(int button)`**: Checks if a mouse button is currently being held down.
*   **`bool IsMouseButtonPressed(int button)`**: Checks if a mouse button was just pressed.
*   **`Vector2 GetMousePosition(void)`**: Returns the current X and Y coordinates of the mouse cursor.
*   **`float GetMouseWheelMove(void)`**: Returns the vertical scroll value of the mouse wheel.
*   **`int GetCharPressed(void)`**: Gets the next character pressed from a queue, useful for text input.

**Example: Keyboard and Mouse Input**
```c
// Inside the main loop, after BeginDrawing()
Vector2 ballPosition = GetMousePosition();

if (IsKeyDown(KEY_RIGHT)) ballPosition.x += 5.0f;
if (IsKeyDown(KEY_LEFT)) ballPosition.x -= 5.0f;
if (IsKeyDown(KEY_UP)) ballPosition.y -= 5.0f;
if (IsKeyDown(KEY_DOWN)) ballPosition.y += 5.0f;

Color ballColor = BLUE;
if (IsMouseButtonDown(MOUSE_BUTTON_LEFT)) ballColor = RED;

DrawCircleV(ballPosition, 30, ballColor);
```

---

### Shapes

RayGPU includes a set of functions for drawing basic 2D and 3D geometric shapes in an immediate-mode style.

*   **`void DrawPixel(int posX, int posY, Color color)`**: Draws a single pixel.
*   **`void DrawLine3D(Vector3 startPos, Vector3 endPos, Color color)`**: Draws a line in 3D space.
*   **`void DrawCircle(int centerX, int centerY, float radius, Color color)`**: Draws a filled circle.
*   **`void DrawRectangleRec(Rectangle rec, Color color)`**: Draws a filled rectangle using a `Rectangle` struct.
*   **`void DrawRectangleLinesEx(Rectangle rec, float lineThick, Color color)`**: Draws the outline of a rectangle with a specified thickness.
*   **`void DrawPoly(Vector2 center, int sides, float radius, float rotation, Color color)`**: Draws a filled regular polygon.

**Example: Drawing Basic Shapes**
```c
// Inside the main loop, after BeginDrawing()
DrawRectangle(10, 10, 100, 50, BLUE);
DrawCircle(200, 100, 40, RED);
DrawLine(0, 200, GetScreenWidth(), 200, BLACK);
DrawPoly((Vector2){GetScreenWidth() - 100, 100}, 6, 50, 0, VIOLET);
```

#### Instanced Drawing

Instancing allows you to draw many copies of the same mesh in a single draw call, each with its own transformation. This is achieved by passing an array of transformation matrices to the shader via a storage buffer.

*   **`void DrawMeshInstanced(Mesh mesh, Material material, const Matrix *transforms, int instances)`**: Draws a mesh multiple times using an array of transformation matrices.

**Example: Instanced Drawing in C**
```c
// In your setup function:
#define INSTANCE_COUNT 100
Mesh cube = GenMeshCube(1.0f, 1.0f, 1.0f);
Matrix transforms[INSTANCE_COUNT];

for (int i = 0; i < INSTANCE_COUNT; i++) {
    float x = (float)(rand() % 20) - 10.0f;
    float y = (float)(rand() % 20) - 10.0f;
    float z = (float)(rand() % 20) - 10.0f;
    transforms[i] = MatrixTranslate(x, y, z);
}
Material material = LoadMaterialDefault();

// In your render loop (inside a 3D mode block):
DrawMeshInstanced(cube, material, transforms, INSTANCE_COUNT);
```

**Example: Corresponding Vertex Shader (WGSL)**
The default vertex shader is already set up for this. The `modelMatrix` storage buffer is indexed using the instance index.
```wgsl
@group(0) @binding(3) var<storage, read> modelMatrix: array<mat4x4f>;

@vertex
fn vs_main(@builtin(instance_index) instanceIdx : u32, in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    // Each instance gets its own model matrix from the storage buffer
    out.position = Perspective_View * modelMatrix[instanceIdx] * vec4f(in.position.xyz, 1.0f);
    // ... other assignments
    return out;
}
```

---

### Textures and Rendertextures

These functions handle loading, unloading, and drawing textures, as well as rendering to off-screen framebuffers (render textures).

*   **`Texture LoadTexture(const char* filename)`**: Loads a texture from an image file.
*   **`void DrawTexturePro(...)`**: An advanced texture drawing function with support for scaling, rotation, and drawing a portion of the source texture.
*   **`RenderTexture LoadRenderTexture(uint32_t width, uint32_t height)`**: Creates a render texture that can be used as a rendering target.
*   **`void BeginTextureMode(RenderTexture rtex)`** and **`void EndTextureMode(void)`**: Redirects all subsequent drawing commands to the specified render texture.

**Example: Loading and Drawing a Texture**
```c
// In your setup function:
Texture2D myTexture = LoadTexture("my_image.png");

// In your render loop:
BeginDrawing();
    ClearBackground(WHITE);
    DrawTexture(myTexture, 100, 100, WHITE);
EndDrawing();
```

**Example: Rendering to a Texture**
```c
// In your setup function:
RenderTexture target = LoadRenderTexture(400, 300);

// In your render loop:
BeginTextureMode(target);
    ClearBackground(SKYBLUE);
    DrawRectangle(0, 0, 400, 300, RED);
    DrawText("Rendered to texture", 20, 20, 20, BLACK);
EndTextureMode();

BeginDrawing();
    ClearBackground(LIGHTGRAY);
    // Draw the render texture to the screen (flipped vertically)
    DrawTextureRec(target.texture, (Rectangle){0, 0, target.texture.width, -target.texture.height}, (Vector2){0, 0}, WHITE);
EndDrawing();
```

#### Separate Textures and Samplers

Unlike older graphics APIs, RayGPU (using modern backends like WebGPU) treats textures (the image data) and samplers (how the texture is read/filtered) as separate objects. There are no "combined image samplers". You must declare and bind them separately in your custom shaders.

*   **`DescribedSampler LoadSampler(TextureWrap amode, TextureFilter fmode)`**: Creates a sampler object.
    *   `TextureWrap`: Defines behavior for texture coordinates outside the `[0, 1]` range (e.g., `TEXTURE_WRAP_REPEAT`, `TEXTURE_WRAP_CLAMP`).
    *   `TextureFilter`: Defines filtering for magnification and minification (e.g., `TEXTURE_FILTER_POINT`, `TEXTURE_FILTER_BILINEAR`).

**Example: GLSL Shader with Separate Texture and Sampler**
```glsl
#version 450

layout(location = 0) in vec2 frag_uv;
layout(location = 1) in vec4 frag_color;

layout(location = 0) out vec4 outColor;

// Binding 1 for the texture data
layout(binding = 1) uniform texture2D texture0;
// Binding 2 for the sampler configuration
layout(binding = 2) uniform sampler texSampler;

void main() {
    // Combine them at sample time
    vec4 texColor = texture(sampler2D(texture0, texSampler), frag_uv);
    outColor = texColor * frag_color;
}
```

**Example: C Code to Bind Texture and Sampler**
```c
// Load a custom shader that uses separate samplers
Shader myShader = LoadShader(NULL, "my_shader.frag");
Texture myTexture = LoadTexture("my_texture.png");

// Create a sampler with repeat wrapping and bilinear filtering
DescribedSampler mySampler = LoadSampler(TEXTURE_WRAP_REPEAT, TEXTURE_FILTER_BILINEAR);

// In the render loop...
BeginShaderMode(myShader);

    // Get uniform locations
    int texLoc = GetUniformLocation(myShader, "texture0");
    int samplerLoc = GetUniformLocation(myShader, "texSampler");

    // Bind the texture to its location
    SetShaderTexture(myShader, texLoc, myTexture);

    // Bind the sampler to its location
    SetShaderSampler(myShader, samplerLoc, mySampler);

    // Draw your geometry
    DrawRectangle(0, 0, GetScreenWidth(), GetScreenHeight(), WHITE);

EndShaderMode();
```

---

### Camera2D / 3D / The Matrix Stack

RayGPU manages transformations using a matrix stack and provides camera abstractions for easy 2D and 3D scene setup.

*   **`void BeginMode2D(Camera2D camera)`** and **`void EndMode2D(void)`**: Sets up a 2D orthographic projection. All drawing between these calls is transformed by the camera's view.
*   **`void BeginMode3D(Camera3D camera)`** and **`void EndMode3D(void)`**: Sets up a 3D perspective projection.
*   **`void rlPushMatrix(void)`**: Pushes (saves) the current transformation matrix.
*   **`void rlPopMatrix(void)`**: Pops (restores) the last saved matrix.
*   **`void rlLoadIdentity(void)`**: Resets the current matrix to the identity matrix.

**Example: A Simple 2D Camera**
```c
// In your setup function:
Camera2D camera = { 0 };
camera.target = (Vector2){ 400.0f, 300.0f };
camera.offset = (Vector2){ GetScreenWidth()/2.0f, GetScreenHeight()/2.0f };
camera.rotation = 0.0f;
camera.zoom = 1.0f;

// In your render loop:
camera.zoom += GetMouseWheelMove() * 0.05f; // Zoom with mouse wheel
if (camera.zoom > 3.0f) camera.zoom = 3.0f;
else if (camera.zoom < 0.1f) camera.zoom = 0.1f;

BeginDrawing();
    ClearBackground(WHITE);
    BeginMode2D(camera);
        // Draw world-space objects here
        DrawRectangle(-100, -100, 200, 200, RED);
    EndMode2D();
    // Draw screen-space UI here
    DrawText("This is a 2D camera!", 10, 10, 20, DARKGRAY);
EndDrawing();
```

---

### Compute Shaders

RayGPU provides an interface for leveraging GPU compute capabilities for general-purpose parallel processing.

*   **`DescribedComputePipeline* LoadComputePipeline(const char* shaderCode)`**: Loads and compiles a compute shader from a WGSL source string.
*   **`DescribedBuffer* GenStorageBuffer(const void* data, size_t size)`**: Creates a GPU buffer for read/write access in shaders.
*   **`void BeginComputepass(void)`** and **`void EndComputepass(void)`**: Delimits a block of compute-related commands.
*   **`void BindComputePipeline(DescribedComputePipeline* cpl)`**: Sets the active compute pipeline.
*   **`void SetBindgroupStorageBuffer(...)`**: Binds a storage buffer to a specified binding point.
*   **`void DispatchCompute(uint32_t x, uint32_t y, uint32_t z)`**: Executes the compute shader with a specified number of workgroups.

**Example: WGSL Compute Shader to Modify a Buffer**
```wgsl
// shader.wgsl
@group(0) @binding(0) var<storage, read_write> data: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    data[index] = f32(index) * 2.0;
}
```

**Example: C Code to Run the Compute Shader**
```c
// In your setup function:
const int ELEMENT_COUNT = 256;
float initialData[ELEMENT_COUNT] = { 0 };
DescribedBuffer* myBuffer = GenStorageBuffer(initialData, sizeof(initialData));

// Load the shader from file or string
char* computeShaderCode = LoadFileText("shader.wgsl");
DescribedComputePipeline* myComputePipeline = LoadComputePipeline(computeShaderCode);
UnloadFileText(computeShaderCode);

// Bind the buffer to binding point 0 of the pipeline's bindgroup
SetBindgroupStorageBuffer(&myComputePipeline->bindGroup, 0, myBuffer);

// In your update/render function (can be called once):
BeginComputepass();
    BindComputePipeline(myComputePipeline);
    // Dispatch enough workgroups to cover all elements.
    // Workgroup size is 64, so we need 256/64 = 4 workgroups.
    DispatchCompute(4, 1, 1);
EndComputepass();

// To read the data back (this is a slow operation):
// You would typically use another compute or render shader to consume the buffer on the GPU.
// For verification, you can map it back to the CPU. This requires more complex buffer mapping logic not shown here.
```