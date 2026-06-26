using MlPortfolio.Api.DTOs;

namespace MlPortfolio.Api.Services;

/// <summary>
/// User profile use-cases: the public read by handle and the authenticated
/// self-service operations (update/delete) keyed by the caller's id. Profile
/// reads expose only public fields.
/// </summary>
public interface IUserService
{
    /// <summary>Public profile by handle. Not-found if the handle is unknown.</summary>
    Task<UserProfileDto> GetPublicProfileAsync(string handle);

    /// <summary>Updates the caller's own display name and bio.</summary>
    Task<UserProfileDto> UpdateProfileAsync(int userId, UpdateProfileDto dto);

    /// <summary>Hard-deletes the caller's account; their projects cascade away.</summary>
    Task DeleteAccountAsync(int userId);
}