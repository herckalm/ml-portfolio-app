namespace MlPortfolio.Api.Exceptions;

/// <summary>
/// Thrown when an authenticated caller attempts an operation they don't own or
/// aren't permitted to perform. Mapped to HTTP 403 by the global exception
/// handler.
/// </summary>
/// <remarks>
/// Defined and wired to 403, but no current code path throws it: owner-scoped
/// operations deliberately use <see cref="NotFoundException"/> (404) for
/// cross-tenant access, so a foreign resource's existence is never revealed.
/// Retained for cases where surfacing "forbidden" is genuinely the intended
/// behavior.
/// </remarks>
public class ForbiddenAccessException : Exception
{
    public ForbiddenAccessException(string message) : base(message)
    {
    }
}