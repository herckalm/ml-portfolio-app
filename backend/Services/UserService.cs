using MlPortfolio.Api.Domain.Entities;
using MlPortfolio.Api.DTOs;
using MlPortfolio.Api.Exceptions;
using MlPortfolio.Api.Repositories;

namespace MlPortfolio.Api.Services;

public class UserService : IUserService
{
    private readonly IUserRepository _users;

    public UserService(IUserRepository users)
    {
        _users = users;
    }

    public async Task<UserProfileDto> GetPublicProfileAsync(string handle)
    {
        var user = await _users.GetByHandleAsync(handle)
            ?? throw new NotFoundException($"No portfolio found for handle '{handle}'.");
        return ToProfileDto(user);
    }

    public async Task<UserProfileDto> UpdateProfileAsync(int userId, UpdateProfileDto dto)
    {
        var user = await _users.GetByIdAsync(userId)
            ?? throw new NotFoundException("User not found.");

        user.DisplayName = dto.DisplayName.Trim();
        user.Bio = string.IsNullOrWhiteSpace(dto.Bio) ? null : dto.Bio.Trim();

        var updated = await _users.UpdateAsync(user);
        return ToProfileDto(updated);
    }

    // maps ONLY public fields — never Email, Role, Id, or PasswordHash.
    private static UserProfileDto ToProfileDto(User user) => new()
    {
        Handle = user.Handle,
        DisplayName = user.DisplayName,
        Bio = user.Bio,
        MemberSince = user.CreatedAt
    };
}