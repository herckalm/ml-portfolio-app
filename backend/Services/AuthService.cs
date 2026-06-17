using MlPortfolio.Api.Domain.Entities;
using MlPortfolio.Api.DTOs;
using MlPortfolio.Api.Exceptions;
using MlPortfolio.Api.Repositories;

namespace MlPortfolio.Api.Services;

public class AuthService : IAuthService
{
    private readonly IUserRepository _repo;
    private readonly JwtService _jwt;

    public AuthService(IUserRepository repo, JwtService jwt)
    {
        _repo = repo;
        _jwt = jwt;
    }

    public async Task<AuthResponse> RegisterAsync(RegisterRequest req)
    {
        if (await _repo.ExistsByEmailAsync(req.Email))
            throw new ConflictException("Email already registered.");

        var handle = await ResolveHandleAsync(req.Handle, req.Email);
        var displayName = string.IsNullOrWhiteSpace(req.DisplayName)
            ? handle
            : req.DisplayName.Trim();

        var user = new User
        {
            Email = req.Email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            Handle = handle,
            DisplayName = displayName
        };

        var created = await _repo.CreateAsync(user);
        var token = _jwt.GenerateToken(created);
        return new AuthResponse(token, created.Email, created.Role, created.Handle);
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest req)
    {
        var user = await _repo.GetByEmailAsync(req.Email);

        if (user is null || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
            throw new UnauthorizedAccessException("Invalid credentials.");

        var token = _jwt.GenerateToken(user);
        return new AuthResponse(token, user.Email, user.Role, user.Handle);
    }

    // if the user explicitly chose a handle, use it
    // if they didn't, derive one from the email and auto-uniquify it.
    private async Task<string> ResolveHandleAsync(string? requested, string email)
    {
        if (!string.IsNullOrWhiteSpace(requested))
        {
            var handle = requested.Trim().ToLowerInvariant();

            // uniform message so i don't reveal which words are reserved.
            if (HandleGenerator.IsReserved(handle) || await _repo.ExistsByHandleAsync(handle))
                throw new ConflictException("That handle isn't available.");

            return handle;
        }

        var baseSlug = HandleGenerator.Normalize(email.Split('@')[0]) ?? "user";
        return await MakeUniqueAsync(baseSlug);
    }

    private async Task<string> MakeUniqueAsync(string baseSlug)
    {
        // bound length (leave room for a "-NN" suffix) and guarantee the minimum.
        if (baseSlug.Length > 25) baseSlug = baseSlug[..25].Trim('-');
        if (baseSlug.Length < 3) baseSlug = "user";

        var candidate = baseSlug;
        var suffix = 1;

        while (HandleGenerator.IsReserved(candidate) || await _repo.ExistsByHandleAsync(candidate))
        {
            suffix++;
            candidate = $"{baseSlug}-{suffix}";
        }

        return candidate;
    }
}