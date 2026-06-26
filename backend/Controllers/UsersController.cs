using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MlPortfolio.Api.DTOs;
using MlPortfolio.Api.DTOs.Common;
using MlPortfolio.Api.Services;

namespace MlPortfolio.Api.Controllers;

/// <summary>
/// User endpoints under <c>api/users</c>. Splits into two access tiers: public
/// reads addressed by handle (profile + that user's published projects), and
/// authenticated self-service on <c>me</c> (update/delete the caller's own
/// account). The caller's identity always comes from the JWT, never the route.
/// </summary>
[ApiController]
[Route("api/users")]
public class UsersController : ControllerBase
{
    private readonly IUserService _users;
    private readonly IProjectService _projects;

    public UsersController(IUserService users, IProjectService projects)
    {
        _users = users;
        _projects = projects;
    }

    /// <summary>GET <c>/api/users/{handle}</c> — public profile; 404 on unknown handle.</summary>
    [HttpGet("{handle}")]
    public async Task<ActionResult<UserProfileDto>> GetProfile(string handle)
    {
        var profile = await _users.GetPublicProfileAsync(handle);
        return Ok(profile);
    }

    /// <summary>GET <c>/api/users/{handle}/projects</c> — public; published projects only, paged.</summary>
    [HttpGet("{handle}/projects")]
    public async Task<ActionResult<PagedResult<ProjectResponseDto>>> GetPublishedProjects(
        string handle, [FromQuery] PaginationQuery query)
    {
        var result = await _projects.GetPublishedByHandleAsync(handle, query);
        return Ok(result);
    }

    /// <summary>PUT <c>/api/users/me</c> — authenticated; updates the caller's own profile.</summary>
    [Authorize]
    [HttpPut("me")]
    public async Task<ActionResult<UserProfileDto>> UpdateMyProfile(UpdateProfileDto dto)
    {
        // Identity from the validated token, not the request body.
        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var profile = await _users.UpdateProfileAsync(userId, dto);
        return Ok(profile);
    }

    /// <summary>
    /// DELETE <c>/api/users/me</c> — authenticated. Hard-deletes the caller's
    /// account; their projects go with it via the FK cascade. Not reversible.
    /// </summary>
    [Authorize]
    [HttpDelete("me")]
    public async Task<IActionResult> DeleteMyAccount()
    {
        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        await _users.DeleteAccountAsync(userId);
        return NoContent();
    }
}