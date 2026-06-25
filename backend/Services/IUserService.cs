using MlPortfolio.Api.DTOs;

namespace MlPortfolio.Api.Services;

public interface IUserService
{
    Task<UserProfileDto> GetPublicProfileAsync(string handle);
    Task<UserProfileDto> UpdateProfileAsync(int userId, UpdateProfileDto dto);
    Task DeleteAccountAsync(int userId);
}