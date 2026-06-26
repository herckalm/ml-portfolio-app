using MlPortfolio.Api.Domain.Entities;
using MlPortfolio.Api.DTOs;
using MlPortfolio.Api.Exceptions;
using MlPortfolio.Api.Repositories;

namespace MlPortfolio.Api.Services;

/// <summary>
/// Implements registration and login. Hashes passwords with BCrypt, issues tokens
/// via <see cref="JwtService"/>, and owns handle resolution: an explicitly chosen
/// handle is validated against the reserved set and uniqueness, while an omitted
/// one is derived from the email local-part and auto-uniquified. All handles are
/// lowercased before persistence, which is what lets the repository's normalized
/// lookups find them.
/// </summary>
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
        // Friendly pre-check for a clean conflict message; the DB unique constraint
        // (caught in the repository) remains the race-safe authority.
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

        // Same error whether the email is unknown or the password is wrong — don't
        // reveal which accounts exist.
        if (user is null || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
            throw new UnauthorizedAccessException("Invalid credentials.");

        var token = _jwt.GenerateToken(user);
        return new AuthResponse(token, user.Email, user.Role, user.Handle);
    }

    /// <summary>
    /// Resolves the handle to persist. An explicit request is normalized, screened
    /// against the reserved set, and checked for uniqueness — failing either with a
    /// deliberately uniform message (so reserved words aren't enumerable). When no
    /// handle is requested, one is derived from the email local-part and uniquified.
    /// </summary>
    private async Task<string> ResolveHandleAsync(string? requested, string email)
    {
        if (!string.IsNullOrWhiteSpace(requested))
        {
            var handle = requested.Trim().ToLowerInvariant();

            // Uniform message so we don't reveal which words are reserved.
            if (HandleGenerator.IsReserved(handle) || await _repo.ExistsByHandleAsync(handle))
                throw new ConflictException("That handle isn't available.");

            return handle;
        }

        var baseSlug = HandleGenerator.Normalize(email.Split('@')[0]) ?? "user";
        return await MakeUniqueAsync(baseSlug);
    }

    /// <summary>
    /// Finds a free handle from a base slug by appending "-N" until one is neither
    /// reserved nor taken. Bounds the base to 25 chars to leave room for the suffix
    /// and enforces the 3-char minimum, falling back to "user".
    /// </summary>
    private async Task<string> MakeUniqueAsync(string baseSlug)
    {
        // Bound length (leave room for a "-NN" suffix) and guarantee the minimum.
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