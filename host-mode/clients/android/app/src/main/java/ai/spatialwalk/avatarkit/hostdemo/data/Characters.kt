package ai.spatialwalk.avatarkit.hostdemo.data

data class AvatarCharacter(
    val id: String,
    val name: String,
)

// @See: https://docs.spatialreal.ai/overview/test-avatars
val defaultCharacters = listOf(
    AvatarCharacter("93dd60f8-d9e2-47cf-973e-d75e10cfc951", "Rohan"),
    AvatarCharacter("17a9aed2-4b35-4eb8-8bf2-675a278bd80d", "Dr.Kellan"),
    AvatarCharacter("2a5170ff-8d1f-4d10-ac50-0ab4893df328", "Priya"),
    AvatarCharacter("ab7117a9-f954-44df-8c25-06d28e4f6ec7", "Josh"),
)
