namespace MlPortfolio.Api.DTOs.Common;

public class PaginationQuery
{
    private int _pageSize = 10;
    public int Page { get; init; } = 1;
    public int PageSize
    {
        get => _pageSize;
        init => _pageSize = value > 50 ? 50 : value;
    }
}