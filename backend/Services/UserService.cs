using MlPortfolio.Api.Domain.Entities;
using MlPortfolio.Api.DTOs;
using MlPortfolio.Api.Exceptions;
using MlPortfolio.Api.Repositories;

namespace MlPortfolio.Api.Services;

/// <summary>
/// Implements <see cref="IUserService"/>. Handles the public profile read and the
/// caller's own profile update/delete. Trims inputs (normalizing a blank bio to
/// null) and projects to <see cref="UserProfileDto"/> through a mapper that
/// exposes only public fields. Account deletion is a hard delete; projects are
/// removed by the database cascade, not here.
/// </summary>
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

    public async Task DeleteAccountAsync(int userId)
    {
        var user = await _users.GetByIdAsync(userId)
            ?? throw new NotFoundException("User not found.");

        // Hard delete. The user's Projects are removed by the FK cascade
        // (Project.Owner OnDelete = Cascade), so no manual project cleanup here.
        await _users.DeleteAsync(user);
    }

    /// <summary>Maps to the public profile DTO — only public fields, never Email, Role, Id, or PasswordHash.</summary>
    private static UserProfileDto ToProfileDto(User user) => new()
    {
        Handle = user.Handle,
        DisplayName = user.DisplayName,
        Bio = user.Bio,
        MemberSince = user.CreatedAt
    };
}