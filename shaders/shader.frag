#version 450

layout(location = 0) in vec4 fragPosition;
layout(location = 1) in vec3 fragColor;
layout(location = 2) in vec3 fragNormal;
layout(location = 3) in vec2 fragTexCoord;
layout(location = 4) in flat int fragTexIdx;
layout(location = 5) in vec4 lightPosition;
layout(location = 6) in vec4 lightTexCoord;
layout(location = 7) in vec3 uKs;

layout(location = 0) out vec4 outColor;

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

layout(binding = 1) uniform sampler2D texSampler[3];

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

layout(binding = 3) uniform sampler2D shadowMapSampler[1];

#define PI 3.141592653589793
#define NUM_SAMPLES 20
#define LIGHT_SIZE 0.01
#define NUM_LIGHTS 3

float rand_1to1(float x) { 
  return fract(sin(x)*10000.0);
}

float rand_2to1(vec2 uv) { 
	return fract(sin(dot(uv.xy, vec2(12.9898,78.233)))* 43758.5453123);
}

float unpack(vec4 rgbaDepth) {
    return dot(rgbaDepth, vec4(1.0, 1.0/255.0, 1.0/(255.0*255.0), 1.0/(256.0*255.0*255.0)));
}

vec2 sampleDisk[NUM_SAMPLES];

void uniformDiskSamples(vec2 randomSeed) {
  float randNum = rand_2to1(randomSeed);
  float sampleX = rand_1to1(randNum) ;
  float sampleY = rand_1to1(sampleX) ;

  float angle = sampleX * 2.0 * PI;
  float radius = sqrt(sampleY);

  for(int i = 0; i < NUM_SAMPLES; i++) {
    sampleDisk[i] = vec2(radius * cos(angle) , radius * sin(angle));

    sampleX = rand_1to1(sampleY) ;
    sampleY = rand_1to1(sampleX) ;

    angle = sampleX * 2.0 * PI;
    radius = sqrt(sampleY);
  }
}

float fresnelSchlick( vec3 wo, vec3 N) {
		float cos = dot(wo, N);
		if (cos < 0.0) return 0.0;
		float n1 = 1.0f;
		float n2 = 10.5;
		float R0 = pow((n1 - n2) / (n1 + n2), 2.0);
		return R0 + (1 - R0) * pow((1 - cos), 5.0);
}

float GGX(vec3 H, vec3 N) {
        float roughness = texture(texSampler[2], fragTexCoord).x;
		float alpha = roughness * roughness;
		float HdotN = max(dot(H,N), 0.0f);
		float inv = 1.0f / (PI * pow(HdotN * HdotN * (alpha * alpha - 1.0f) + 1.0f, 2.0f));
		return alpha * alpha * inv;
}

float GSchlick(vec3 V, vec3 N) {
        float roughness = texture(texSampler[2], fragTexCoord).x;
		float k = roughness * roughness / 2.0f;
		float VdotN = max(dot(V,N), 0.0f);
		return VdotN / (VdotN * (1.0f - k) + k);
}

float GSmith(vec3 wo, vec3 wi, vec3 N) {
		return GSchlick(wo, N) * GSchlick(wi, N);
}

vec3 evalMicrofacet(vec3 wo, vec3 wi, vec3 N) {
		if ((dot(wi,N) > 0.0)) {
			float OdotN = max(dot(wo,N), 0.0);
			float IdotN = max(dot(wi,N), 0.0);
			vec3 H = normalize((wi + wo));
			float F = fresnelSchlick(wo, H);
			float D = GGX(H, N);
			float G = GSmith(wo, wi, N);
			float specular;
			if (OdotN * IdotN < 0.001) specular = 0.0f;
			else specular = F * G * D / (4 * OdotN * IdotN);
            vec3 albedo;
            if (fragTexIdx >= 0)
                albedo =  texture(texSampler[fragTexIdx], fragTexCoord).xyz;
            else
                albedo =  fragColor ;
			vec3 diffuse = (1 - F) * albedo / PI;
			vec3 fr = vec3(specular, specular, specular) + diffuse;
			return fr;
		}
		else return vec3(0.0f, 0.0f, 0.0f);
}
vec3 localToWorld(vec3 localDir, vec3 N) {
    vec3 T, B;

    if ((N.x * N.x + N.z * N.z) > 0.0){
        float inv = 1.0 / sqrt(N.x * N.x + N.z * N.z);
        T = inv * vec3(-N.z, 0.0f, N.x);
	    B = cross(N, T);
    }
    else{
        T = vec3(-1.0, 0.0, 0.0);
	    B = cross(N, T);
    }

	return localDir.x * T + localDir.y * B + localDir.z * N;
}

float findAvgBlockerDepth(sampler2D shadowMapSampler, vec2 uv, float dReceiver, float zNear, float zFar, float lightSize, float screenDepth) {
	uniformDiskSamples(uv);

    int blockerNum = 0;
    float depth = 0.0;

    float radius = lightSize * (screenDepth - zNear) / screenDepth;

    for(int i = 0; i < NUM_SAMPLES; i++) {
        vec2 offset = radius * sampleDisk[i];
        vec2 sampleUV = uv + offset;
        float shadowMapDepth;
        if(sampleUV.x < 0.0 || sampleUV.x > 1.0 || sampleUV.y < 0.0 || sampleUV.y > 1.0){
            shadowMapDepth = 1.0;
        }
        else{
            shadowMapDepth = unpack(texture(shadowMapSampler, sampleUV));
        }

        if(shadowMapDepth < dReceiver){
            blockerNum++;
            depth += shadowMapDepth;
        }
    }

    if (blockerNum == 0)
        return -1.0;
    else 
        return depth / blockerNum;
}

float sampleShadowMap(sampler2D shadowMapSampler, vec4 shadow_map_coord, float bias){

    float visibility = 1.0;

    if (unpack(texture(shadowMapSampler, shadow_map_coord.xy)) < (shadow_map_coord.z - bias))
        visibility = 0.2;

    return visibility;
}

float PCF(sampler2D shadowMapSampler, vec4 shadow_map_coord, float radius, float bias) {
    uniformDiskSamples(shadow_map_coord.xy);
    float visibility = 0.0;

    for(int i = 0; i < NUM_SAMPLES; i++) {
        vec4 offset = vec4(radius * sampleDisk[i], 0.0, 0.0);
        vec4 sampleUV = shadow_map_coord + offset;
        if(sampleUV.x < 0.0 || sampleUV.x > 1.0 || sampleUV.y < 0.0 || sampleUV.y > 1.0){
            visibility += 0.0;
        }
        else{
            visibility += sampleShadowMap(shadowMapSampler, shadow_map_coord + offset, bias);
        }

    }

    return visibility / NUM_SAMPLES;
}

float PCSS(sampler2D shadowMapSampler, vec4 shadow_map_coord, float zNear, float zFar, float bias, float lightSize, float screenDepth){
  float dReceiver = (screenDepth - zNear) / (zFar- zNear);
  float dBlock = findAvgBlockerDepth(shadowMapSampler, shadow_map_coord.xy, dReceiver, zNear, zFar, lightSize, screenDepth);

  if(shadow_map_coord.x < 0.0 || shadow_map_coord.x > 1.0 || shadow_map_coord.y < 0.0 || shadow_map_coord.y > 1.0){
            return 0.0;
  }

  if (dBlock == -1.0)
    return 1.0;

  float wPenumbra = (dReceiver - dBlock) * lightSize * zNear / screenDepth / dBlock;
  float visibility =  PCF(shadowMapSampler, shadow_map_coord, wPenumbra, bias);

  return visibility;

}

vec3 blinnPhong(vec4 lightPosition, vec3 light_emit){
    vec3 color;
    if (fragTexIdx >= 0)
        color = texture(texSampler[fragTexIdx], fragTexCoord).xyz;
    else
        color = fragColor ;

    vec3 ambient = 0.05 * color;

    vec3 light_coff = light_emit / pow(length(ubo.camera_position - fragPosition.xyz), 2.0);
    vec3 light_vector = normalize(lightPosition.xyz - fragPosition.xyz);
    vec3 normal_vector = normalize(texture(texSampler[1], fragTexCoord).xyz);
    float cos = max(0.0, dot(normal_vector, light_vector));
    
    vec3 diffuse = color * light_coff  * cos;

    vec3 view_vector = normalize(ubo.camera_position - fragPosition.xyz);
    vec3 half_vector = normalize(light_vector + view_vector);
    float spec_cos = pow(max(dot(half_vector, normal_vector), 0.0), 32.0);
    vec3 specular = uKs * light_coff * spec_cos;
    return (diffuse + ambient + specular);
}

void main() {
    outColor = vec4(vec3(0.0), 1.0);
    float max_bias;
    float min_bias;
    max_bias= 0.004;
    min_bias = 0.001;


    vec3 view_vector = normalize(ubo.camera_position - fragPosition.xyz);
        vec3 light_vector = normalize(lightPosition.xyz - fragPosition.xyz);
        vec3 normal_vector = localToWorld(normalize(texture(texSampler[1], fragTexCoord).xyz), normalize(fragNormal));
        float cos = max(0.0, dot(normal_vector, light_vector));

        float bias = max(max_bias * (1.0 - max(0.0, dot(normalize(fragNormal), light_vector))), min_bias); 

        vec4 coord = lightTexCoord / lightTexCoord.w;
        vec4 shadow_map_coord = vec4(coord.xy * 0.5 + 0.5, (coord.z * lightTexCoord.w - light[0].zNear) / (light[0].zFar- light[0].zNear), coord.w);

        float visibility = PCSS(shadowMapSampler[0], shadow_map_coord, light[0].zNear, light[0].zFar, bias, LIGHT_SIZE, lightTexCoord.z);
        //visibility = PCF(shadowMapSampler, shadow_map_coord, light_size, bias);
        vec3 phongColor = blinnPhong(lightPosition, light[0].light_emit);


        outColor += vec4(light[0].light_emit * evalMicrofacet(view_vector, light_vector, normal_vector) * (visibility) * cos, 0.0);
   
}