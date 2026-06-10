using Microsoft.AspNetCore.Mvc;
using MlPortfolio.Api.DTOs;
using MlPortfolio.Api.Services;

namespace MlPortfolio.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;

    public AuthController(IAuthService authService)
    {
        _authService = authService;
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterRequest req)
    {
        try
        {
            var response = await _authService.RegisterAsync(req);
            return Ok(response);
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { message = ex.Message });
        }
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest req)
    {
        var response = await _authService.LoginAsync(req);
        if (response is null)
            return Unauthorized(new { message = "Invalid credentials." });
        return Ok(response);
    }
}
