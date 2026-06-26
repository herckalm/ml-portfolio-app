namespace MlPortfolio.Api.Exceptions;

/// <summary>
/// Thrown when a requested resource doesn't exist — or, for owner-scoped
/// operations, when it exists but isn't visible to the caller (used deliberately
/// in place of 403 to avoid leaking foreign ids). Mapped to HTTP 404 by the
/// global exception handler.
/// </summary>
public class NotFoundException : Exception
{
    public NotFoundException(string message) : base(message)
    {
    }
}