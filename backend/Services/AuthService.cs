using MlPortfolio.Api.Domain.Entities;
using MlPortfolio.Api.DTOs;
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
            throw new InvalidOperationException("Email already registered.");

        var user = new User
        {
            Email = req.Email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password)
        };

        var created = await _repo.CreateAsync(user);
        var token = _jwt.GenerateToken(created);
        return new AuthResponse(token, created.Email, created.Role);
    }

    public async Task<AuthResponse?> LoginAsync(LoginRequest req)
    {
        var user = await _repo.GetByEmailAsync(req.Email);

        if (user is null || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
            return null;

        var token = _jwt.GenerateToken(user);
        return new AuthResponse(token, user.Email, user.Role);
    }
}
