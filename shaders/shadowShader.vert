#version 450

layout(binding = 0) uniform LightMVP {
    mat4 model;
    mat4 view_proj;
    vec3 light_position;
    vec3 light_emit;
    vec3 dir;
    float zNear;
    float zFar;
    bool perspective;
}light;

layout(location = 0) in vec3 inPosition;
layout(location = 1) in vec3 inColor;
layout(location = 2) in vec3 inNormal;
layout(location = 3) in vec2 inTexCoord;
layout(location = 4) in int inTexIdx;
layout(location = 5) in vec3 uKs;

layout(location = 0) out vec4 fragPosition;

void main() {
    vec4 position =  vec4(inPosition, 1.0);
    gl_Position =  light.view_proj * light.model * position;
    fragPosition = light.view_proj * light.model * vec4(inPosition + 0.0 * inNormal, 1.0);
}