#version 450

layout(binding = 0) uniform UniformBufferObject {
    mat4 model;
    mat4 view;
    mat4 proj;
    vec3 light_position;
    vec3 light_emit;
    vec3 camera_position;
    float zNear;
    float zFar;
} ubo;

layout(binding = 2) uniform LightMVP {
    mat4 model;
    mat4 view_proj;
    vec3 light_position;
    vec3 light_emit;
    vec3 dir;
    float zNear;
    float zFar;
    bool perspective;
}light[1];

layout(location = 0) in vec3 inPosition;
layout(location = 1) in vec3 inColor;
layout(location = 2) in vec3 inNormal;
layout(location = 3) in vec2 inTexCoord;
layout(location = 4) in int inTexIdx;
layout(location = 5) in vec3 uKs;

layout(location = 0) out vec4 fragPosition;
layout(location = 1) out vec3 fragColor;
layout(location = 2) out vec3 fragNormal;
layout(location = 3) out vec2 fragTexCoord;
layout(location = 4) out int fragTexIdx;
layout(location = 5) out vec4 lightPosition;
layout(location = 6) out vec4 lightTexCoord;
layout(location = 7) out vec3 fragKs;

void main() {
    vec4 position = ubo.model * vec4(inPosition, 1.0);
    position = position / position.w;
    vec4 normal = ubo.model * vec4(inNormal, 1.0);
    normal = normal / normal.w;
    vec4 light_pos = ubo.model* inverse(light[0].model) * vec4(light[0].light_position, 1.0);
    light_pos /= light_pos.w;

    gl_Position = ubo.proj * ubo.view * position;
    //gl_Position = light[0].view_proj * light[0].model * vec4(inPosition, 1.0);

    fragPosition = position;
    fragColor = inColor;
    fragNormal = normal.xyz;
    fragTexCoord = inTexCoord;
    fragTexIdx = inTexIdx;
    lightPosition = light_pos;
    lightTexCoord = light[0].view_proj * light[0].model * vec4(inPosition, 1.0);

    fragKs = uKs;
}